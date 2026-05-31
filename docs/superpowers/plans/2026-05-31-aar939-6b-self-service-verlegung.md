# AAR-939 6b Self-Service-Verlegung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Nach Dispatcher-bestätigtem embed-B-SV-No-Show automatisch einen Ersatz-SV zuweisen und dem Kunden einen Re-Termin-Magic-Link schicken, über den er selbst einen Slot beim Ersatz-SV wählt.

**Architecture:** Hängt an `bestaetigeSvNoShowVomTeam` (Dispatcher-Resolve, #2101). Eine neue Orchestrierungs-Action `verlegeNachNoShowEmbedB` (a) markiert den alten Termin `verlegt`, (b) wählt Auto-Top-1 Ersatz-SV via `findBestSV(excludeSvId)`, (c) hängt `claims.sv_id` um (Sync→`faelle.sv_id`), (d) schreibt `faelle.re_termin_token` + sendet Magic-Link. Der Kunde nutzt den **bestehenden** `waehleReTerminSlot`-Flow (liest `faelle.sv_id` = jetzt Ersatz-SV).

**Tech Stack:** Next.js 16 Server-Actions, supabase-js (admin), `findBestSV` (98044b6b/AAR-940-Lib), `sendCommunication` (Baileys WA).

**STACKED auf #2101** (`kitta/aar-939-embed-b-claim-kaskade`): der Einhängepunkt (`embed-b-dispatcher-actions.ts`, `EmbedBKlaerungCard`) lebt in #2101, das noch nicht voll in staging ist. Dieser Branch ist auf kaskade gebaut → PR ist stacked, merged NACH #2101. (Aaron-Entscheidung 31.05.)

**Coordination-Lanes (gelockt):** `state-machine.ts` NICHT anfassen (0243cdab). 6b arbeitet auf `gutachter_termine` + `claims.sv_id`, KEINE claims.status-Transition. `findBestSV` = reuse, nur additiver `excludeSvId`. `sv_no_show_am` steht VOR Reserve (€70-sauber).

---

## File Structure

- **Create:** `src/lib/termine/verlege-nach-no-show.ts` — `verlegeNachNoShowEmbedB()` + `findReplacementSv()` (fokussiert, kein actions.ts-Bloat). NICHT `'use server'` (intern, von der Dispatcher-Action gerufen; Konstanten-Export-Falle vermeiden).
- **Modify:** `src/lib/dispatch/findBestSV.ts` — `excludeSvId?` in `SvMatchInput` + Filter.
- **Modify:** `src/lib/termine/embed-b-dispatcher-actions.ts` — `bestaetigeSvNoShowVomTeam` ruft `verlegeNachNoShowEmbedB`; Result trägt das Verlegungs-Outcome.
- **Modify:** `src/components/dispatch/EmbedBKlaerungCard.tsx` — Toast spiegelt das Outcome (Ersatz-SV / manueller Fallback).
- **Verify/Modify:** `src/app/kunde/re-termin/[token]/page.tsx` — zeigt Ersatz-SV-Slots (liest `fall.sv_id`, den wir umhängen → wahrscheinlich kein Change).
- **Create:** `scripts/smoke-6b-verlegung.mjs` — reversibler DB-Smoke (Pattern wie `smoke-embed-b-wa-inbound.mjs`).

---

## Task 1: `findBestSV` — `excludeSvId`-Filter

**Files:**
- Modify: `src/lib/dispatch/findBestSV.ts` (`SvMatchInput` type ~Z.27; Destructure ~Z.92; Filter nach `applyDispatchableFilter`)

- [ ] **Step 1: `excludeSvId` zum Input-Type adden**

In `SvMatchInput` (nach `stickySvId`):
```typescript
  // AAR-939 6b: bei der Verlegung den No-Show-SV ausschliessen.
  excludeSvId?: string | null
```

- [ ] **Step 2: Filter nach dem SV-Query**

Nach `const svs = svsRaw as unknown as Array<Record<string, unknown>>` einen Filter:
```typescript
  const svsGefiltert = input.excludeSvId
    ? svs.filter((sv) => (sv.id as string) !== input.excludeSvId)
    : svs
```
und die folgenden Verwendungen von `svs` auf `svsGefiltert` umstellen (im Selben Block — grep `svs.` / `for (... of svs)` ab der Filter-Zeile).

- [ ] **Step 3: tsc grün**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dispatch/findBestSV.ts
git commit -m "feat(AAR-939): findBestSV excludeSvId-Filter (6b-Vorarbeit)"
```

---

## Task 2: `verlegeNachNoShowEmbedB` + `findReplacementSv` (neue Orchestrierung)

**Files:**
- Create: `src/lib/termine/verlege-nach-no-show.ts`
- Test: `scripts/smoke-6b-verlegung.mjs` (Task 6)

- [ ] **Step 1: Neue Datei mit beiden Funktionen**

```typescript
// AAR-939 6b — Self-Service-Verlegung nach embed-B-SV-No-Show.
// Gerufen aus bestaetigeSvNoShowVomTeam (nach dem sv_no_show_am-Marker).
// KEIN 'use server' (intern). Non-fatal: bei Fehler bleibt der Klaerungs-Task offen.
import { createAdminClient } from '@/lib/supabase/admin'
import { findBestSV } from '@/lib/dispatch/findBestSV'
import crypto from 'crypto'

type AdminClient = ReturnType<typeof createAdminClient>

export type VerlegungErgebnis = {
  ok: boolean
  ersatzSvId?: string | null
  manuell?: boolean      // true = kein Ersatz-SV automatisch, manueller Pfad
  error?: string
}

// Ersatz-SV via Auto-Top-1 (Original ausgeschlossen). Standort aus dem alten Termin.
async function findReplacementSv(
  db: AdminClient,
  params: { lat: number; lng: number; excludeSvId: string },
): Promise<string | null> {
  const kandidaten = await findBestSV(
    { fallLat: params.lat, fallLng: params.lng, excludeSvId: params.excludeSvId },
    1,
  )
  return kandidaten[0]?.svId ?? null
}

export async function verlegeNachNoShowEmbedB(terminId: string): Promise<VerlegungErgebnis> {
  const db = createAdminClient()

  // Alten Termin laden (sv_id + Standort + status fuer Idempotenz).
  const { data: alt } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, sv_id, status, besichtigungsort_lat, besichtigungsort_lng')
    .eq('id', terminId)
    .maybeSingle()
  if (!alt) return { ok: false, error: 'Termin nicht gefunden' }

  // Idempotenz (Realtime-Replay): bereits voll verlegt -> No-Op. status='verlegt' wird
  // als LETZTER Schritt gesetzt (Completion-Marker), daher ein sicherer Guard.
  if ((alt.status as string | null) === 'verlegt') return { ok: true }

  const altSvId = (alt.sv_id as string | null) ?? null
  const claimId = (alt.claim_id as string | null) ?? null
  const fallId = (alt.fall_id as string | null) ?? null

  // Standort: Termin-SSoT (gutachter_termine) -> Fallback faelle.besichtigungsort_*.
  // embed-B-Termine sind oft ohne geocodierten Termin-Ort -> faelle-Fallback noetig.
  let lat = alt.besichtigungsort_lat as number | null
  let lng = alt.besichtigungsort_lng as number | null
  if ((lat == null || lng == null) && fallId) {
    const { data: fallOrt } = await db
      .from('faelle')
      .select('besichtigungsort_lat, besichtigungsort_lng')
      .eq('id', fallId)
      .maybeSingle()
    lat = lat ?? ((fallOrt?.besichtigungsort_lat as number | null) ?? null)
    lng = lng ?? ((fallOrt?.besichtigungsort_lng as number | null) ?? null)
  }

  // Ersatz-SV (Auto-Top-1). Kein Standort/SV -> manueller Fallback (KEIN verlegt-Mark, retry-faehig).
  let ersatzSvId: string | null = null
  if (lat != null && lng != null && altSvId) {
    ersatzSvId = await findReplacementSv(db, { lat, lng, excludeSvId: altSvId })
  }
  if (!ersatzSvId) {
    // Manueller Fallback: Klaerungs-Task bleibt offen (Caller resolved ihn NICHT),
    // Dispatcher-Mitteilung non-critical.
    try {
      const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
      await createMitteilung({
        empfaenger_rolle: 'dispatch',
        kategorie: 'task',
        titel: 'Kein Ersatz-SV automatisch gefunden',
        inhalt: 'Bitte manuell einen Ersatz-Gutachter vermitteln (Self-Service-Verlegung).',
        kontext_typ: 'fall',
        kontext_id: fallId ?? terminId,
        prioritaet: 'hoch',
      })
    } catch (err) { console.error('[6b] Mitteilung (non-critical):', err) }
    return { ok: true, ersatzSvId: null, manuell: true }
  }

  // 3) Claim auf Ersatz-SV umhaengen (claims.sv_id = SSoT; Sync-Trigger -> faelle.sv_id).
  if (claimId) {
    const { error: svErr } = await db.from('claims').update({ sv_id: ersatzSvId }).eq('id', claimId)
    if (svErr) return { ok: false, error: 'SV-Umhaengung fehlgeschlagen: ' + svErr.message }
  }

  // 4) Re-Termin-Token + Magic-Link. Token dort schreiben, wo waehleReTerminSlot LIEST
  //    (faelle.re_termin_token) — plus gutachter_termine als SSoT-Spiegel.
  const token = crypto.randomUUID()
  if (fallId) {
    await db.from('faelle').update({ re_termin_token: token, re_termin_token_eingelaufen_am: null }).eq('id', fallId)
  }
  await db.from('gutachter_termine')
    .update({ re_termin_token: token, re_termin_token_eingelaufen_am: null })
    .eq('id', terminId)

  // Magic-Link an Kunde (non-critical).
  try {
    let leadId: string | null = null
    if (fallId) {
      const { data: fall } = await db.from('faelle').select('lead_id').eq('id', fallId).maybeSingle()
      leadId = (fall?.lead_id as string | null) ?? null
    }
    if (leadId) {
      const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', leadId).maybeSingle()
      const telefon = (lead?.telefon as string | null) ?? null
      if (telefon) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
        const reTerminUrl = `${baseUrl}/kunde/re-termin/${token}`
        const { sendCommunication } = await import('@/lib/communications/send')
        await sendCommunication('no_show_kunde', {
          telefon,
          vorname: (lead?.vorname as string | null) ?? '',
          '1': (lead?.vorname as string | null) ?? '',
          '2': reTerminUrl,
          fall_id: fallId ?? '',
        }).catch(() => {})
      }
    }
  } catch (err) { console.error('[6b] Magic-Link (non-critical):', err) }

  // Timeline (non-critical).
  if (fallId) {
    try {
      await db.from('timeline').insert({
        fall_id: fallId, typ: 'termin',
        titel: 'Verlegung: Ersatz-Gutachter zugewiesen',
        beschreibung: 'Nach SV-No-Show wurde automatisch ein Ersatz-Gutachter zugewiesen; der Kunde wählt einen neuen Termin.',
      })
    } catch { /* non-critical */ }
  }

  // Completion-Marker + Idempotenz-Key: alten Termin verlegt — LETZTER Schritt, damit
  // ein Fehler davor (kein verlegt) einen sauberen Retry erlaubt.
  await db.from('gutachter_termine').update({ status: 'verlegt' }).eq('id', terminId).not('status', 'eq', 'verlegt')

  return { ok: true, ersatzSvId }
}
```

- [ ] **Step 2: tsc grün**

Run: `npx tsc --noEmit -p tsconfig.json` → EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/termine/verlege-nach-no-show.ts
git commit -m "feat(AAR-939): 6b verlegeNachNoShowEmbedB + findReplacementSv (Orchestrierung)"
```

(Smoke-Verifikation: Task 6 — gegen Live-DB, da kein Unit-Runner für Server-Actions im Projekt.)

---

## Task 3: Einhängen in `bestaetigeSvNoShowVomTeam`

**Files:**
- Modify: `src/lib/termine/embed-b-dispatcher-actions.ts:42-51`

- [ ] **Step 1: Verlegung nach dem No-Show-Marker einhängen**

`bestaetigeSvNoShowVomTeam` umbauen (Result trägt Verlegungs-Outcome):
```typescript
import { verlegeNachNoShowEmbedB } from '@/lib/termine/verlege-nach-no-show'
// ...
export async function bestaetigeSvNoShowVomTeam(
  terminId: string,
): Promise<{ ok: boolean; error?: string; ersatzSvId?: string | null; manuell?: boolean }> {
  const res = await markSvNoShowEmbedB(terminId)
  if (!res.ok) return res
  // AAR-939 6b: Self-Service-Verlegung — Ersatz-SV + Re-Termin-Link.
  const verlegung = await verlegeNachNoShowEmbedB(terminId)
  const db = createAdminClient()
  // Task nur schliessen, wenn die Verlegung lief (bei manuell offen lassen).
  if (!verlegung.manuell) {
    await resolveKlaerungsTask(db, terminId, 'SV-No-Show bestätigt + Verlegung eingeleitet')
  }
  revalidate()
  return { ok: true, ersatzSvId: verlegung.ersatzSvId ?? null, manuell: verlegung.manuell }
}
```
Den Datei-Header-Kommentar „KEINE Verlegung" → „Verlegung via verlegeNachNoShowEmbedB (6b)" anpassen.

- [ ] **Step 2: tsc grün** → `npx tsc --noEmit -p tsconfig.json` EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/termine/embed-b-dispatcher-actions.ts
git commit -m "feat(AAR-939): 6b in bestaetigeSvNoShowVomTeam einhaengen"
```

---

## Task 4: `EmbedBKlaerungCard` — Toast-Feedback

**Files:**
- Modify: `src/components/dispatch/EmbedBKlaerungCard.tsx:31-44`

- [ ] **Step 1: Toast spiegelt das Verlegungs-Outcome**

In `handle()` den No-Show-Zweig erweitern:
```typescript
    if (action === 'noshow') {
      const r = res as { ok: boolean; error?: string; ersatzSvId?: string | null; manuell?: boolean }
      toast.success(
        r.manuell
          ? 'SV-No-Show vermerkt — kein Ersatz-SV automatisch, bitte manuell vermitteln.'
          : 'SV-No-Show vermerkt — Ersatz-Gutachter zugewiesen, Re-Termin-Link an Kunde gesendet.',
      )
    } else {
      toast.success('Als durchgeführt vermerkt')
    }
    router.refresh()
```
(die bestehende `toast.success(... ? 'SV-No-Show vermerkt' : ...)`-Zeile ersetzen.)

- [ ] **Step 2: tsc + Build (Component-Set-Ratchet)** → `npx tsc --noEmit -p tsconfig.json` EXIT 0. (Keine neuen Buttons → Ratchet trivial.)

- [ ] **Step 3: Commit**

```bash
git add src/components/dispatch/EmbedBKlaerungCard.tsx
git commit -m "feat(AAR-939): 6b EmbedBKlaerungCard Toast-Feedback fuer Verlegung"
```

---

## Task 5: Re-Termin-Page (Ersatz-SV-Slots) — verifizieren

**Files:**
- Read/Verify: `src/app/kunde/re-termin/[token]/page.tsx`

- [ ] **Step 1: Page lesen** — lädt sie die freien Slots über `fall.sv_id` (generisch)? Wenn ja: **kein Change** (wir haben `faelle.sv_id` auf den Ersatz-SV umgehängt → Page zeigt automatisch dessen Slots). Wenn die Page einen `nur_gutachter`/`service_typ`-Guard hat der embed-B blockt → minimal anpassen (embed-B zulassen).
- [ ] **Step 2:** Falls kein Change nötig → notieren; sonst Edit + tsc + Commit.

---

## Task 6: Smoke + tsc + PR

**Files:**
- Create: `scripts/smoke-6b-verlegung.mjs`

- [ ] **Step 1: Smoke-Script (reversibel, Pattern wie smoke-embed-b-wa-inbound.mjs)**

Modi `run`: Seed embed-B-Termin (nur_gutachter-Claim CLM-2026-00109, sv_id=SeedSv, besichtigungsort gesetzt) → `verlegeNachNoShowEmbedB(terminId)` direkt aufrufen (via Replik der Logik ODER tsx-frei: replizieren wie die anderen Smokes) → asserts: alter Termin `status='verlegt'`, `claims.sv_id` ≠ alter SV (oder `manuell=true` wenn kein Kandidat), `faelle.re_termin_token` gesetzt. Edge: kein Standort → `manuell`. Cleanup: Termin/Claim/Token zurück. **€70-Check:** `sv_no_show_am` steht VOR dem Token (Reihenfolge im Code).

- [ ] **Step 2: Smoke laufen** → `node scripts/smoke-6b-verlegung.mjs run` → alle PASS.

- [ ] **Step 3: Voller tsc** → `npx tsc --noEmit -p tsconfig.json` EXIT 0.

- [ ] **Step 4: PR**

```bash
git push -u origin kitta/aar-939-6b-self-service-verlegung
gh pr create --base staging --title "feat(AAR-939): 6b Self-Service-Verlegung (embed-B No-Show -> Auto-Ersatz-SV + Kunde-Token)" --body-file <body>
```
PR-Body: STACKED auf #2101 (Hinweis: bis #2101 in staging zeigt der Diff dessen Commits mit), 7-Punkte-Audit, Smoke-Ergebnis, reuse findBestSV. **Nicht selbst mergen.**

---

## Self-Review (gegen Spec)

- **Spec-Coverage:** No-Show-Marker (Task 3 nutzt bestehenden markSvNoShowEmbedB) ✓; Auto-Top-1 Ersatz-SV (Task 1+2) ✓; claims.sv_id-Umhängung (Task 2) ✓; Re-Termin-Token+Magic-Link (Task 2) ✓; Kunde-Self-Pick (Task 5 = bestehender waehleReTerminSlot) ✓; Card-Feedback (Task 4) ✓; „kein Ersatz-SV"-Fallback (Task 2) ✓; sv_no_show vor Reserve (Task 3-Reihenfolge) ✓; **Idempotenz** (Task 2: status='verlegt' als letzter Completion-Marker + Top-Guard) ✓; state-machine.ts unberührt ✓.
- **Token-Ort:** faelle.re_termin_token (Reader-Quelle, `waehleReTerminSlot` Z.48) + gutachter_termine (SSoT-Spiegel) — deckt den Mismatch (Generierung in storno-actions schreibt nur GT; 6b schreibt beide).
- **Verifiziert (live, 31.05.):** `SvMatchCandidate.svId` (findBestSV Z.42); `gutachter_termine.besichtigungsort_lat/lng` existiert (actions.ts:127) + `faelle.besichtigungsort_*` (get-sv-tagesplan) → Task-2-Fallback; Reverse-Sync `claims.sv_id→faelle.sv_id` (Migration `20260516192003_cmm60_schritt3_reverse_sync_claims_sv_id`).
- **Build-time offen (in Task 5/6 zu erden):** Re-Termin-Page-Slot-Source (Task 5); ob `besichtigungsort_*` für echte embed-B-Termine befüllt ist (sonst manueller Fallback greift — graceful, kein Crash); `createMitteilung`-Signatur (Pfad `@/lib/mitteilungen/create-mitteilung` + Feld-Namen) gegen Bestand prüfen.
