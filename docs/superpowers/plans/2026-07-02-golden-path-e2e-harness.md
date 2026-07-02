# Golden-Path E2E-Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Harness, der EINEN synthetischen Fall durch die echte Kern-Pipeline (Lead→Claim→SV→Gutachten→Billing→Kanzlei→Regulierung→Abschluss) treibt, nach jeder Stufe DB-Zustand **und** Rollen-Sichtbarkeit assertet, und die Testdaten hart aufräumt.

**Architecture:** `src/lib/health/golden-path.ts` ruft die echten server-seitigen lib-Funktionen auf (Admin-Client), assertet per Stufe gegen die DB, prüft per Stufe die Rollen-Sichtbarkeit via JWT-Sim-Helper-RPC, und räumt via `delete_fall_komplett` auf. Hülle: `/api/cron/golden-path` (CRON_SECRET) + Dead-Letter-Alert.

**Tech Stack:** Next.js 15 Route-Handler, Supabase (Admin-Client service-role, apply_migration-Plugin für DDL), TypeScript, vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-02-golden-path-e2e-harness-design.md` (inkl. §4b Rollen-Abdeckung). Bei Konflikt gewinnt die Spec.
- **Regel 1:** Branch `kitta/golden-path-harness` (off staging), PR gegen staging, nie main.
- **Regel 2:** DDL (Task 1) NUR via `mcp__plugin_supabase_supabase__apply_migration`; File-Name == getrackte Version (`list_migrations`/`schema_migrations`).
- **Comms-Safety (First-Class):** Der Harness darf KEINE echte Nachricht an einen realen Empfänger senden. `@claimondo.test`-Kontakte + inaktiver Test-SV + keine reale Kanzlei-Bindung. **Task 6 verifiziert vor dem ersten Prod-Lauf jeden Side-Effect-Pfad** — würde einer einen realen Empfänger treffen → Test-Guard ergänzen oder Transition stoppen. Comms-Safety schlägt Vollständigkeit.
- **Prod-DB shared:** Admin-Client = service-role (`@/lib/supabase/admin`). Testdaten existieren kurz in Prod → Marker (`@claimondo.test`, `source_channel='golden_path'`) + idempotentes Pre-Cleanup + `finally`-Cleanup.
- **Verifikation:** `npm run build` grün (Route-Handler), `NODE_OPTIONS=--max-old-space-size=8192`. Server-Logik-Tests: vitest (strukturell/DB-Smoke).
- **Exakte Signaturen (Explore-verifiziert):** `createLead(admin, base, extra)` · `convertLeadToFall(admin, leadId, userId): Promise<{fallId}>` · `setSvIdForFall(admin, fallId, svId)` · `transitionFallStatus(fallId, newStatus, {user_id})` (self-admin) · `pushMandatToKanzlei(fallId)` (self-admin, test-safe-skip) · `resolveClaimId(admin, fallId)` · `admin.rpc('delete_fall_komplett', {p_fall_id, p_claim_id})` · `recordFailedOperation({operationType,dedupKey,error})` / `markOperationResolved(dedupKey)` aus `@/lib/reliability/dead-letter`.
- **Status-Sequenz (gegen FALL_STATUS_TRANSITIONS verifiziert):** `sv-zugewiesen → sv-termin → besichtigung → gutachten-eingegangen → filmcheck → kanzlei-uebergeben → anschlussschreiben → regulierung → zahlung-eingegangen → abgeschlossen`.

---

## Task 1: Rollen-Sichtbarkeits-Helper (Migration)

**Files:**
- Create (DDL via Plugin): Funktion `golden_path_claim_visible_for(p_claim_id uuid, p_user_id uuid) RETURNS boolean`
- Create: `supabase/migrations/<V>_golden_path_claim_visible_for.sql` (Name == getrackte Version)

**Interfaces:**
- Produces: `admin.rpc('golden_path_claim_visible_for', { p_claim_id, p_user_id }) → boolean` — true wenn der User den Claim unter RLS sähe.

- [ ] **Step 1: DDL via apply_migration anwenden.**
```sql
CREATE OR REPLACE FUNCTION public.golden_path_claim_visible_for(p_claim_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- JWT-Sim wie RLS-Safety-Net #3334 (audit_claim_view_identity): setzt den simulierten
  -- User als auth.uid()-Quelle; claim_sichtbar_fuer_aktuellen_user liest auth.uid()/role.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  RETURN public.claim_sichtbar_fuer_aktuellen_user(p_claim_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.golden_path_claim_visible_for(uuid, uuid) FROM public, anon, authenticated;
```
Aufruf: `apply_migration({ name: 'golden_path_claim_visible_for', query: <oben> })`.

- [ ] **Step 2: Getrackte Version ablesen + File committen.** `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1` → `<V>`. File `supabase/migrations/<V>_golden_path_claim_visible_for.sql` mit exakt der angewandten DDL.

- [ ] **Step 3: DB-Smoke (READ) verifizieren.** Mit einem realen Kunde-User + einem seiner Claims:
```sql
-- positiv: Eigentümer sieht; negativ: fremder User sieht nicht
SELECT public.golden_path_claim_visible_for('<claim_id>', '<owner_user_id>') AS soll_true,
       public.golden_path_claim_visible_for('<claim_id>', '00000000-0000-0000-0000-000000000000') AS soll_false;
```
Erwartet: `soll_true=true`, `soll_false=false`. Falls nicht → JWT-Sim greift nicht; Muster gegen `audit_claim_view_identity` abgleichen.

- [ ] **Step 4: Commit.**
```bash
git add supabase/migrations/*_golden_path_claim_visible_for.sql
git commit -m "feat(health): golden_path_claim_visible_for — JWT-Sim Rollen-Sichtbarkeits-Helper"
```

---

## Task 2: Test-Fixtures (persistenter Test-SV + Test-KB)

**Files:**
- Create: `src/lib/health/golden-path-fixtures.ts`
- Test: `src/lib/health/golden-path-fixtures.test.ts`

**Interfaces:**
- Produces: `ensureGoldenPathFixtures(): Promise<{ svId: string; svUserId: string; kbUserId: string; kundeUserId: string }>` — idempotent; legt (falls fehlend) einen inaktiven Test-SV (`@claimondo.test`, `ist_aktiv=false`) + nutzt/legt Test-KB + Test-Kunde-User an. Marker: email `golden-path-sv@claimondo.test` etc.

- [ ] **Step 1: Failing-Test schreiben (Fixtures idempotent + Marker + inaktiv).**
```ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
describe('golden-path-fixtures', () => {
  const src = readFileSync('src/lib/health/golden-path-fixtures.ts', 'utf8')
  it('nutzt @claimondo.test-Marker', () => { expect(src).toMatch(/@claimondo\.test/) })
  it('legt Test-SV inaktiv an (nicht im Dispatch)', () => { expect(src).toMatch(/ist_aktiv:\s*false/) })
  it('ist idempotent (upsert/select-vor-insert)', () => { expect(src).toMatch(/maybeSingle|upsert|onConflict/) })
})
```

- [ ] **Step 2: Test laufen → FAIL** (File fehlt). `npx vitest run src/lib/health/golden-path-fixtures.test.ts`.

- [ ] **Step 3: Fixtures implementieren.** `ensureGoldenPathFixtures` mit `createAdminClient()`:
  - Test-Kunde: `admin.auth.admin.createUser({ email:'golden-path-kunde@claimondo.test', email_confirm:true })` (idempotent: vorher per email suchen; bei „already exists" die id via `admin.auth.admin.listUsers`/profiles holen) + `profiles.upsert({ id, email, rolle:'kunde' }, {onConflict:'id'})`.
  - Test-KB: analog `golden-path-kb@claimondo.test`, `rolle:'kundenbetreuer'`.
  - Test-SV: analog `golden-path-sv@claimondo.test`, `rolle:'sachverstaendiger'` + `sachverstaendige.upsert({ profile_id, user_id, ist_aktiv:false, verifizierung_status:..., ...Pflichtfelder }, {onConflict:...})`. **`ist_aktiv:false`** (aus Dispatch raus). Pflichtfelder der `sachverstaendige`-Insert vorab via `list_tables`/DB prüfen (NOT-NULL-Spalten).
  - Rückgabe der IDs. Alle Schritte idempotent (select-or-create).
  - **REFRESH:** exakte Pflichtspalten von `sachverstaendige` + `profiles` gegen die aktuelle DB verifizieren (Task-Start).

- [ ] **Step 4: Test → PASS** + `npx tsc --noEmit`.

- [ ] **Step 5: Einmal live ausführen + verifizieren** (via temporärem Script oder Task 5-Route mit `?fixturesOnly=1`): Fixtures existieren, SV `ist_aktiv=false`. `execute_sql`: `SELECT ist_aktiv FROM sachverstaendige s JOIN profiles p ON p.id=s.profile_id WHERE p.email='golden-path-sv@claimondo.test'` → false.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/health/golden-path-fixtures.ts src/lib/health/golden-path-fixtures.test.ts
git commit -m "feat(health): golden-path Test-Fixtures (inaktiver Test-SV/KB/Kunde, @claimondo.test)"
```

---

## Task 3: Kern-Harness — Pipeline treiben + DB-Assert + Cleanup

**Files:**
- Create: `src/lib/health/golden-path.ts`
- Test: `src/lib/health/golden-path.test.ts`

**Interfaces:**
- Consumes: `ensureGoldenPathFixtures()` (Task 2); die Kern-lib-Funktionen (Global Constraints).
- Produces: `runGoldenPath(): Promise<GoldenPathReport>` mit `type StageResult = { stage: string; ok: boolean; detail: string; ms: number }` und `type GoldenPathReport = { ok: boolean; stages: StageResult[]; fallId: string|null; claimId: string|null; cleanedUp: boolean; error?: string }`.

- [ ] **Step 1: Failing-Test (Struktur + Cleanup-Garantie).**
```ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
describe('golden-path core', () => {
  const src = readFileSync('src/lib/health/golden-path.ts', 'utf8')
  it('exportiert runGoldenPath', () => { expect(src).toMatch(/export async function runGoldenPath/) })
  it('raeumt im finally auf (delete_fall_komplett)', () => {
    expect(src).toMatch(/finally/); expect(src).toMatch(/delete_fall_komplett/)
  })
  it('pre-cleanup vor dem Lauf (Marker-Loeschung)', () => { expect(src).toMatch(/golden-path/) })
  it('treibt bis abgeschlossen', () => { expect(src).toMatch(/'abgeschlossen'/) })
  it('assertet den Billing-Hook (lead_preis_netto)', () => { expect(src).toMatch(/lead_preis_netto/) })
})
```

- [ ] **Step 2: Test → FAIL.**

- [ ] **Step 3: Kern implementieren.** Struktur (echte Signaturen einsetzen; jede Stufe: drive → assert → push StageResult):
```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'
import { setSvIdForFall } from '@/lib/faelle/sv-assignment'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { pushMandatToKanzlei } from '@/lib/kanzlei/push-mandat'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { ensureGoldenPathFixtures } from './golden-path-fixtures'

const MARKER = 'golden_path'
type StageResult = { stage: string; ok: boolean; detail: string; ms: number }
export type GoldenPathReport = { ok: boolean; stages: StageResult[]; fallId: string|null; claimId: string|null; cleanedUp: boolean; error?: string }

export async function runGoldenPath(): Promise<GoldenPathReport> {
  const admin = createAdminClient()
  const stages: StageResult[] = []
  let fallId: string | null = null, claimId: string | null = null, cleanedUp = false
  const stage = async (name: string, fn: () => Promise<string>) => {
    const t0 = performance.now()
    try { const detail = await fn(); stages.push({ stage: name, ok: true, detail, ms: Math.round(performance.now()-t0) }) }
    catch (err) { stages.push({ stage: name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Math.round(performance.now()-t0) }); throw err }
  }
  try {
    await preCleanup(admin)                                  // Marker-Reste weg
    const fx = await ensureGoldenPathFixtures()
    let leadId = ''
    await stage('lead', async () => {
      const r = await createLead(admin, { source_channel: MARKER, status: 'neu' as never },
        { email: `golden-path+${Date.now()}@claimondo.test`, vorname: 'GoldenPath', nachname: 'Smoke', telefon: '+490000000000' })
      if (!r.ok) throw new Error(r.error); leadId = r.leadId; return leadId
    })
    await stage('claim', async () => {
      const r = await convertLeadToFall(admin, leadId, fx.kbUserId); fallId = r.fallId
      claimId = await resolveClaimId(admin, fallId)
      const { data } = await admin.from('claims').select('id, operative_status').eq('id', claimId!).single()
      if (!data) throw new Error('Claim nicht erstellt'); return `claim=${claimId} status=${data.operative_status}`
    })
    await stage('sv-zuweisung', async () => {
      await setSvIdForFall(admin, fallId!, fx.svId)
      const { data } = await admin.from('claims').select('sv_id').eq('id', claimId!).single()
      if (data?.sv_id !== fx.svId) throw new Error(`sv_id nicht gesetzt: ${data?.sv_id}`); return `sv_id=${fx.svId}`
    })
    // Initial-Status auf sv-zugewiesen bringen (ersterfassung -> sv-zugewiesen ist im Graph gueltig)
    await driveTransition(admin, fallId!, claimId!, 'sv-zugewiesen', stage)
    await driveTransition(admin, fallId!, claimId!, 'sv-termin', stage)
    await driveTransition(admin, fallId!, claimId!, 'besichtigung', stage)
    await stage('gutachten+billing', async () => {
      await admin.from('gutachten').upsert(
        { claim_id: claimId!, sv_id: fx.svId, fertiggestellt_am: new Date().toISOString(), gesamt_schadensbetrag: 5500 },
        { onConflict: 'claim_id' })
      await transitionFallStatus(fallId!, 'gutachten-eingegangen', { user_id: fx.kbUserId })
      const { data } = await admin.from('claims').select('operative_status, lead_preis_netto').eq('id', claimId!).single()
      if (data?.operative_status !== 'gutachten-eingegangen') throw new Error(`status=${data?.operative_status}`)
      if (data?.lead_preis_netto == null) throw new Error('Billing-Hook feuerte nicht (lead_preis_netto NULL)')
      return `status=gutachten-eingegangen lead_preis=${data.lead_preis_netto}`
    })
    await driveTransition(admin, fallId!, claimId!, 'filmcheck', stage)
    await driveTransition(admin, fallId!, claimId!, 'kanzlei-uebergeben', stage)
    await stage('mandat-push', async () => {
      const r = await pushMandatToKanzlei(fallId!)
      // test-safe: success ODER skipped:true beide ok (externer Push bewusst geblockt)
      if (!('success' in r)) throw new Error('unerwartete Rueckgabe')
      return r.success ? 'pushed' : `skipped:${(r as { skipped?: boolean }).skipped}`
    })
    await driveTransition(admin, fallId!, claimId!, 'anschlussschreiben', stage)
    await driveTransition(admin, fallId!, claimId!, 'regulierung', stage)
    await driveTransition(admin, fallId!, claimId!, 'zahlung-eingegangen', stage)
    await driveTransition(admin, fallId!, claimId!, 'abgeschlossen', stage)
  } catch { /* Stufe hat den Fehler schon in stages gepusht */ }
  finally {
    try { if (fallId || claimId) { await admin.rpc('delete_fall_komplett', { p_fall_id: fallId, p_claim_id: claimId }); await preCleanup(admin); cleanedUp = true } }
    catch (err) { stages.push({ stage: 'cleanup', ok: false, detail: err instanceof Error ? err.message : String(err), ms: 0 }) }
  }
  const ok = stages.every(s => s.ok)
  return { ok, stages, fallId, claimId, cleanedUp }
}

async function driveTransition(admin: ReturnType<typeof createAdminClient>, fallId: string, claimId: string, target: string, stage: (n: string, fn: () => Promise<string>) => Promise<void>) {
  await stage(`status:${target}`, async () => {
    await transitionFallStatus(fallId, target, { user_id: undefined })
    const { data } = await admin.from('claims').select('operative_status').eq('id', claimId).single()
    if (data?.operative_status !== target) throw new Error(`erwartet ${target}, ist ${data?.operative_status}`)
    return target
  })
}

async function preCleanup(admin: ReturnType<typeof createAdminClient>) {
  const { data: reste } = await admin.from('claims').select('id, lead_id').eq('source_channel', MARKER) // ggf. via fall_typ/Marker-Spalte
  for (const c of reste ?? []) {
    await admin.rpc('delete_fall_komplett', { p_fall_id: c.id, p_claim_id: c.id })
    if (c.lead_id) await admin.from('leads').delete().eq('id', c.lead_id)
  }
  await admin.from('leads').delete().eq('source_channel', MARKER)
}
```
**REFRESH beim Bau:** (a) den Marker-Spaltennamen prüfen — Claims haben evtl. keine `source_channel`; ggf. `fall_typ`-Marker wie lifecycle-seed (`GOLDEN-PATH`) nutzen. (b) `createLead`-`status`-Enum-Wert (`'neu'`?) gegen `lead_status` verifizieren. (c) initial `operative_status` nach `convertLeadToFall` lesen — falls schon ≥ `sv-zugewiesen`, die erste Transition anpassen/überspringen.

- [ ] **Step 4: tsc grün** (`npx tsc --noEmit`) + struktureller Test PASS.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/health/golden-path.ts src/lib/health/golden-path.test.ts
git commit -m "feat(health): golden-path Kern — Pipeline treiben + DB-Assert + Cleanup"
```

---

## Task 4: Per-Rollen-Sichtbarkeits-Assertion

**Files:**
- Modify: `src/lib/health/golden-path.ts` (Rollen-Checks nach Schlüssel-Stufen)
- Test: `src/lib/health/golden-path.test.ts` (erweitern)

**Interfaces:**
- Consumes: `admin.rpc('golden_path_claim_visible_for', { p_claim_id, p_user_id })` (Task 1); `fx` IDs (Task 2).

- [ ] **Step 1: Failing-Test (Rollen-Assertion vorhanden).**
```ts
it('assertet Rollen-Sichtbarkeit (golden_path_claim_visible_for)', () => {
  const src = readFileSync('src/lib/health/golden-path.ts', 'utf8')
  expect(src).toMatch(/golden_path_claim_visible_for/)
  expect(src).toMatch(/nicht sichtbar|Negativ|fremd/i)
})
```

- [ ] **Step 2: Test → FAIL.**

- [ ] **Step 3: Rollen-Assertion einbauen.** Helper + Aufrufe an den in §4b spezifizierten Stufen:
```ts
async function assertVisible(admin: Db, claimId: string, userId: string, label: string, expected: boolean) {
  const { data, error } = await admin.rpc('golden_path_claim_visible_for', { p_claim_id: claimId, p_user_id: userId })
  if (error) throw new Error(`visibility-rpc: ${error.message}`)
  if (Boolean(data) !== expected) throw new Error(`${label}: sichtbar=${data}, erwartet ${expected}`)
}
```
Nach `claim`: `stage('rolle:kunde-sicht', () => assertVisible(admin, claimId!, fx.kundeUserId, 'kunde', true))`.
Nach `sv-zuweisung`: `stage('rolle:sv-sicht', () => assertVisible(admin, claimId!, fx.svUserId, 'sv', true))` — **Kern-Hypothese der 84→2-Klippe**.
Nach `claim` (einmalig): `stage('rolle:fremd-negativ', () => assertVisible(admin, claimId!, '00000000-0000-0000-0000-000000000000', 'fremd', false))`.
KB-Sicht (`fx.kbUserId`, true) nach `sv-zuweisung`. (dispatch/admin/kanzlei: analog, sofern Test-User vorhanden — sonst dokumentiert weglassen, kein Platzhalter.)
Jede Rollen-Assertion ist eine eigene `stage(...)` → im Report als eigene Zeile.

- [ ] **Step 4: tsc + Test PASS.**

- [ ] **Step 5: Commit.**
```bash
git add src/lib/health/golden-path.ts src/lib/health/golden-path.test.ts
git commit -m "feat(health): golden-path Per-Rollen-Sichtbarkeit (SV/Kunde/KB + Negativ-Gegenprobe)"
```

---

## Task 5: Cron-Route + Dead-Letter-Alert

**Files:**
- Create: `src/app/api/cron/golden-path/route.ts`
- Test: `src/app/api/cron/golden-path/route.test.ts`

**Interfaces:**
- Consumes: `runGoldenPath()` (Task 3/4); `recordFailedOperation`/`markOperationResolved` aus `@/lib/reliability/dead-letter`.

- [ ] **Step 1: Failing-Test (CRON_SECRET-Gate + Alert-Verdrahtung).**
```ts
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
describe('cron/golden-path', () => {
  const src = readFileSync('src/app/api/cron/golden-path/route.ts', 'utf8')
  it('gated per CRON_SECRET', () => { expect(src).toMatch(/CRON_SECRET/) })
  it('ruft runGoldenPath', () => { expect(src).toMatch(/runGoldenPath/) })
  it('alertet bei Fehler + resolved bei Erfolg', () => {
    expect(src).toMatch(/recordFailedOperation/); expect(src).toMatch(/markOperationResolved/)
  })
})
```

- [ ] **Step 2: Test → FAIL.**

- [ ] **Step 3: Route implementieren.**
```ts
import { NextResponse } from 'next/server'
import { runGoldenPath } from '@/lib/health/golden-path'
import { recordFailedOperation, markOperationResolved } from '@/lib/reliability/dead-letter'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await runGoldenPath()
  const DEDUP = 'golden-path-daily'
  if (!report.ok) {
    const failed = report.stages.find(s => !s.ok)
    await recordFailedOperation({ operationType: 'golden_path', dedupKey: DEDUP,
      error: `Stufe '${failed?.stage}': ${failed?.detail}`, payload: { stages: report.stages } })
  } else {
    await markOperationResolved(DEDUP)
  }
  return NextResponse.json(report, { status: report.ok ? 200 : 500 })
}
```
**REFRESH:** exakte Signatur von `recordFailedOperation`/`markOperationResolved` gegen `@/lib/reliability/dead-letter` (Explore: `{operationType, dedupKey, error, payload?}` / `(dedupKey)`).

- [ ] **Step 4: `npm run build` grün** (Route-Handler — voller Build Pflicht).

- [ ] **Step 5: Commit.**
```bash
git add src/app/api/cron/golden-path/route.ts src/app/api/cron/golden-path/route.test.ts
git commit -m "feat(health): /api/cron/golden-path (CRON_SECRET) + Dead-Letter-Alert"
```

---

## Task 6: Comms-Safety-Verifikation + erster Prod-Lauf (Gate)

**Files:**
- Modify: `src/lib/health/golden-path.ts` (Guards/Skips falls nötig)
- Doc: Ergebnis-Vermerk im PR-Body + Marker

**Interfaces:** Consumes: alle vorigen Tasks.

- [ ] **Step 1: Jeden Side-Effect-Pfad der getriebenen Transitions lesen.** Für jede Transition der Sequenz in `state-machine.ts` die gefeuerten Sends prüfen (Kunde-Email/WA, SV-Mitteilung, Kanzlei-Email @ `kanzlei-uebergeben`, LexDrive). Für jeden: löst er für die Test-Entity zu Test-Empfänger/No-Op auf?
  - `@claimondo.test`-Kunde → Email bounced/no-op ✓
  - Test-SV `@claimondo.test` → SV-Mitteilung an Test ✓
  - Kanzlei-Email @ `kanzlei-uebergeben` (`buildAndSendKanzleiEmail`) → **kritisch prüfen**: Empfänger-Resolution; ohne reale Kanzlei-Bindung am Test-Claim kein realer Empfänger.

- [ ] **Step 2: Guard/Skip ergänzen wo nötig.** Falls ein Pfad einen realen Empfänger treffen würde: Test-Daten-Guard analog `pushMandatToKanzlei` (Skip bei `@claimondo.test`) am Send-Punkt ergänzen, ODER die Transition im Harness stoppen (partieller Golden-Path, im Report vermerkt). Kein Send an reale Empfänger.

- [ ] **Step 3: Erster Prod-Lauf (on-demand).** `curl -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/golden-path` (oder lokal gegen Prod-DB via Script). Report pro Stufe prüfen. **Erwartung: es bricht irgendwo — das ist der Wert** (die reale Bruchstelle der hinteren Funnel-Hälfte).

- [ ] **Step 4: Cleanup verifizieren.** `execute_sql`: `SELECT count(*) FROM leads WHERE source_channel='golden_path'` (+ Marker-Claims) → 0. Keine `@claimondo.test`-golden-path-Reste.

- [ ] **Step 5: Comms-Safety verifizieren.** Prüfen (Logs/`communications`-Tabelle), dass kein Send an einen realen Empfänger ging.

- [ ] **Step 6: Commit + PR-Body mit Befund.**
```bash
git add src/lib/health/golden-path.ts
git commit -m "chore(health): golden-path Comms-Safety verifiziert + erster Prod-Lauf-Befund"
```

- [ ] **Step 7: VPS-Crontab** (Aaron/Infra): nightly `GET /api/cron/golden-path` mit `CRON_SECRET`. Im PR-Body notieren.

---

## Self-Review (gegen Spec)

**Spec-Coverage:** §2 Architektur → Task 3 (Kern) + Task 5 (Route). §3 Stages → Task 3. §4 Comms-Safety → Task 6. §4b Rollen-Abdeckung → Task 1 (Helper) + Task 4 (Assertions). §5 Test-Entities/Cleanup → Task 2 + Task 3 (pre/finally). §6 Form/Alert → Task 5. §9 Erfolgskriterien → Task 6 (Prod-Lauf, Cleanup-, Comms-Verifikation). **Keine Lücke.**

**Placeholder-Scan:** Die REFRESH-Marker sind bewusste Verankerungs-Punkte (exakte Enum-Werte/Pflichtspalten/Marker-Spalte gegen die Live-DB), keine offenen Enden — jeder nennt genau was zu prüfen ist. Kein „TBD".

**Typ-Konsistenz:** `GoldenPathReport`/`StageResult` in Task 3 definiert, in Task 5 konsumiert. `ensureGoldenPathFixtures()`-Rückgabe (`svId/svUserId/kbUserId/kundeUserId`) in Task 3/4 genutzt — konsistent. `golden_path_claim_visible_for(p_claim_id, p_user_id)` in Task 1 def, Task 4 konsumiert. `runGoldenPath()` durchgängig.

**Scope:** Ein Subsystem (Golden-Path-Harness), ein Plan. OK.
