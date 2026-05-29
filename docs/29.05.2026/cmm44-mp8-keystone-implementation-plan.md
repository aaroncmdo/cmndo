# CMM-44 MP-8 Keystone — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Steps nutzen Checkbox-Syntax (`- [ ]`).
> **Spec:** `docs/29.05.2026/cmm44-mp8-keystone-terminal-vocabulary-spec.md` (freigegeben 2026-05-29; Defaults der 5 §8-Punkte akzeptiert).

**Goal:** `claims.status`-Terminal-Vokabular über Writer, CHECK und Read-Model angleichen, sodass die Phase **Abschluss** erreichbar + korrekt sub-klassifiziert wird (heute nur `storniert`).

**Architecture:** Phase ist abgeleitet (`getClaimLifecycle` + SQL-Spiegel `v_claim_phase`). Writer setzen `claims.status`; Read-Model mappt terminale Status → Abschluss-Substate und (neu) nicht-terminale → Regulierungs-Substate. Reine Funktionen → unit-testbar ohne DB.

**Tech Stack:** Next.js 15, TypeScript, Supabase (Postgres 17), vitest. Server-Actions `'use server'`, Result-Shape `{ ok; error? }`.

**Gating:** Phase A = DB-frei (jetzt baubar + build/unit-verifizierbar). Phase B (DDL) + C (UI-Live-Smoke) = **DB muss durabel stabil sein** (29.05. flaky, `SELECT 1` timeoutet) → erst ausführen wenn DB hält. Deploy-Reihenfolge (Spec §5): CHECK → Read-Model/View → Writer → Backfill; nichts deployt bis Branch komplett + via staging→main-Release (Content-verifiziert).

---

## Phase A — DB-freier Code (jetzt ausführbar)

### Task A1: Read-Model erweitern — `src/lib/claims/lifecycle.ts`

**Files:** Modify `src/lib/claims/lifecycle.ts`

- [ ] **Step 1: `ClaimSubPhase` um 3 Werte erweitern**

Im Union-Type ergänzen:
```ts
  // Abschluss (neu)
  | 'abgelehnt_final'
  | 'an_externe_kanzlei'
  // Regulierung (neu — einfache Ablehnung)
  | 'nachforderung'
```

- [ ] **Step 2: `SUBPHASE_LABEL` ergänzen**
```ts
  abgelehnt_final: 'Abgelehnt (final)',
  an_externe_kanzlei: 'An externe Kanzlei übergeben',
  nachforderung: 'VS-Ablehnung — Nachforderung',
```

- [ ] **Step 3: `mainPhaseOf` ergänzen** — `nachforderung` → regulierung, die zwei neuen Abschluss-Subs fallen in den `return 'abschluss'`-Default:
```ts
  if (sub === 'versicherungskontakt' || sub === 'auszahlung' || sub === 'nachforderung') return 'regulierung'
```

- [ ] **Step 4: `ABSCHLUSS_SUBSTATE` um 2 terminale Status erweitern**
```ts
const ABSCHLUSS_SUBSTATE: Record<string, ClaimSubPhase> = {
  reguliert_vollstaendig: 'erfolgreich_reguliert',
  storniert:              'storniert',
  klage_rechtsstreit:     'klage_rechtsstreit',
  verjaehrt:              'verjaehrt',
  abgelehnt_final:        'abgelehnt_final',
  an_externe_kanzlei_uebergeben: 'an_externe_kanzlei',
}
```

- [ ] **Step 5: Status-Regulierungs-Map einführen** (über `getClaimLifecycle`)
```ts
/** Nicht-terminale claims.status, die Regulierung signalisieren (CMM-44 MP-8). */
const REGULIERUNG_STATUS_SUBSTATE: Record<string, ClaimSubPhase> = {
  in_kommunikation_vs: 'versicherungskontakt',
  abgelehnt:           'nachforderung',
}
```

- [ ] **Step 6: `getClaimLifecycle` — Status-Regulierung NACH dem lexdrive-Zweig einfügen**

Direkt nach dem `if (kanzleiFall?.lexdrive_case_id) { … }`-Block (vor dem Kanzlei-Interim-Block):
```ts
  // ── Regulierung (Status-getrieben) ── CMM-44 MP-8: in_kommunikation_vs /
  // einfache abgelehnt signalisieren Regulierung auch ohne übernommenen Kanzleifall.
  const regSub = claimStatus ? REGULIERUNG_STATUS_SUBSTATE[claimStatus] : undefined
  if (regSub) {
    return { mainPhase: 'regulierung', subPhase: regSub, aktiveSideQuests: sideQuests, aktiverAuftrag: sideQuests[0] ?? null }
  }
```

- [ ] **Step 7: Kommentar-Block oben (Zeilen 4-18) um die Status-Regulierungs-Regel + die 6 terminalen Status ergänzen** (Doku-Treue zur Spec).

### Task A2: Unit-Tests — `getClaimLifecycle`

**Files:** Create `src/lib/claims/lifecycle.test.ts` (falls nicht vorhanden; sonst erweitern)

- [ ] **Step 1: Test-Helper + Terminal-Cases**
```ts
import { describe, it, expect } from 'vitest'
import { getClaimLifecycle } from './lifecycle'

const base = { lead: null, auftraege: [], kanzleiFall: null }

describe('getClaimLifecycle — MP-8 Terminal-Vokabular', () => {
  it.each([
    ['reguliert_vollstaendig', 'abschluss', 'erfolgreich_reguliert'],
    ['storniert',              'abschluss', 'storniert'],
    ['klage_rechtsstreit',     'abschluss', 'klage_rechtsstreit'],
    ['verjaehrt',              'abschluss', 'verjaehrt'],
    ['abgelehnt_final',        'abschluss', 'abgelehnt_final'],
    ['an_externe_kanzlei_uebergeben', 'abschluss', 'an_externe_kanzlei'],
  ])('status %s → %s/%s', (status, main, sub) => {
    const r = getClaimLifecycle({ ...base, claimStatus: status })
    expect(r.mainPhase).toBe(main)
    expect(r.subPhase).toBe(sub)
  })
})
```

- [ ] **Step 2: Status-Regulierung (nicht-terminal)**
```ts
describe('getClaimLifecycle — MP-8 Status-Regulierung', () => {
  it('in_kommunikation_vs → regulierung/versicherungskontakt', () => {
    const r = getClaimLifecycle({ ...base, claimStatus: 'in_kommunikation_vs' })
    expect(r.mainPhase).toBe('regulierung'); expect(r.subPhase).toBe('versicherungskontakt')
  })
  it('einfache abgelehnt → regulierung/nachforderung', () => {
    const r = getClaimLifecycle({ ...base, claimStatus: 'abgelehnt' })
    expect(r.mainPhase).toBe('regulierung'); expect(r.subPhase).toBe('nachforderung')
  })
})
```

- [ ] **Step 3: Priorität — terminal schlägt lexdrive; lexdrive schlägt Status-Regulierung**
```ts
describe('getClaimLifecycle — MP-8 Priorität', () => {
  const kf = { lexdrive_case_id: 'lx_1', status: 'versicherungskontakt' } as any
  it('terminal > lexdrive', () => {
    const r = getClaimLifecycle({ ...base, kanzleiFall: kf, claimStatus: 'reguliert_vollstaendig' })
    expect(r.mainPhase).toBe('abschluss')
  })
  it('lexdrive > status-regulierung', () => {
    const r = getClaimLifecycle({ ...base, kanzleiFall: kf, claimStatus: 'in_kommunikation_vs' })
    expect(r.mainPhase).toBe('regulierung'); expect(r.subPhase).toBe('versicherungskontakt')
  })
})
```

- [ ] **Step 4: Run** — `npx vitest run src/lib/claims/lifecycle.test.ts` → alle grün.

### Task A3: Writer umbauen — `src/lib/claims/endzustand-actions.ts`

**Files:** Modify `src/lib/claims/endzustand-actions.ts`

- [ ] **Step 1: Stalen Kommentar (Z. 12-14) ersetzen**
```ts
// Phase wird NICHT mehr per Trigger gesetzt (trg_claims_set_phase in MP-6c gedroppt).
// Sie wird aus claims.status via v_claim_phase / getClaimLifecycle abgeleitet.
```

- [ ] **Step 2: `ENDZUSTAENDE`-Guard auf terminales Vokabular**
```ts
const ENDZUSTAENDE = [
  'reguliert_vollstaendig', 'storniert', 'klage_rechtsstreit',
  'verjaehrt', 'abgelehnt_final', 'an_externe_kanzlei_uebergeben',
] as const
```
(Wichtig: `abgelehnt` + `in_kommunikation_vs` NICHT im Guard → Weiter-Übergänge erlaubt.)

- [ ] **Step 3: `markClaimAsReguliert`** → `status: 'reguliert_vollstaendig'`; Audit `to_phase: 'abschluss:erfolgreich_reguliert'`.

- [ ] **Step 4: `markClaimAsAbgelehnt` + `final?: boolean`**
```ts
export async function markClaimAsAbgelehnt(input: {
  claim_id: string; vs_ablehnungs_grund: string; grund_freitext?: string
  final?: boolean; notify_customer?: boolean
}): Promise<ActionResult> {
  // …guards/ctx wie gehabt…
  const status = input.final ? 'abgelehnt_final' : 'abgelehnt'
  const set = await setEndzustandFields(input.claim_id,
    { status, vs_ablehnungs_grund: input.vs_ablehnungs_grund }, auth.user, grund, ENDZUSTAENDE)
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }
  await writeAudit(ctx.fallId, null,
    input.final ? 'abschluss:abgelehnt_final' : 'regulierung:nachforderung', auth.user, grund)
  // …emitEvent claim.abgelehnt (Payload um final ergänzen)…
}
```

- [ ] **Step 5: `markClaimAsAnExterneKanzlei`** — Status-Wert bleibt `'an_externe_kanzlei_uebergeben'`; Audit `to_phase: 'abschluss:an_externe_kanzlei'`.

- [ ] **Step 6: `markClaimAsStorniert`** — Status bleibt `'storniert'`; Audit `to_phase: 'abschluss:storniert'`.

- [ ] **Step 7: `markClaimAsInKommunikationVs`** — Status bleibt; Audit `to_phase: 'regulierung:versicherungskontakt'`.

- [ ] **Step 8: NEU `markClaimAsKlage`** (nach Muster, Notify=ja)
```ts
export async function markClaimAsKlage(input: {
  claim_id: string; grund: string; notify_customer?: boolean
}): Promise<ActionResult> {
  const auth = await requireRole(['admin', 'kundenbetreuer'])
  if (!auth.success) return { ok: false, error: auth.error }
  if (!input.grund?.trim()) return { ok: false, error: 'grund ist Pflicht' }
  const ctx = await loadClaimContext(input.claim_id)
  if (!ctx.ok) return ctx
  if (!authorizedForClaim(auth.user, ctx.kbId)) return { ok: false, error: 'Nicht berechtigt für diesen Claim' }
  const set = await setEndzustandFields(input.claim_id, { status: 'klage_rechtsstreit' }, auth.user, input.grund, ENDZUSTAENDE)
  if (!set.ok) return { ok: false, error: set.error ?? 'Update fehlgeschlagen' }
  await writeAudit(ctx.fallId, null, 'abschluss:klage_rechtsstreit', auth.user, input.grund)
  if (input.notify_customer ?? true) {
    try { await emitEvent('claim.klage_rechtsstreit', { claimId: input.claim_id, fallId: ctx.fallId, grund: input.grund }, { fallId: ctx.fallId, triggeredBy: auth.user.id }) }
    catch (err) { console.error('[MP-8] emit claim.klage_rechtsstreit failed:', err) }
  }
  revalidatePath(`/faelle/${ctx.fallId}`)
  return { ok: true }
}
```

- [ ] **Step 9: NEU `markClaimAsVerjaehrt`** — analog, `status: 'verjaehrt'`, Audit `'abschluss:verjaehrt'`, Notify-Default `false`.

- [ ] **Step 10: emitEvent-Typen** — falls `emitEvent` ein getyptes Event-Enum nutzt: `claim.klage_rechtsstreit` + `claim.verjaehrt` in der Event-Map (`src/lib/notifications/…`) ergänzen, sonst tsc-Fehler. (Bei Plan-Ausführung greppen: `grep -rn "claim.reguliert\b" src/lib/notifications`.)

### Task A4: Build grün

- [ ] **Step 1:** `unlink node_modules` + `npm install` im Worktree (Build-Falle [[feedback_worktree_build_gate]]: Junction erbt kaputtes `require-in-the-middle`).
- [ ] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün (Server-Actions → voller Build, nicht nur tsc).
- [ ] **Step 3:** Commit Phase A.

---

## Phase B — DDL (DB-gated; erst bei stabiler DB)

### Task B1: CHECK-Constraint erweitern (additiv)
- [ ] Aktuelle Definition live ziehen: `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.claims'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%status%'`.
- [ ] Migration via Plugin `apply_migration` (Regel 2, **ohne** `begin;/commit;`): DROP + ADD CONSTRAINT mit der bestehenden IN-Liste **plus** `reguliert_vollstaendig`, `klage_rechtsstreit`, `verjaehrt`, `abgelehnt_final`. `reguliert` (alt) drin lassen.
- [ ] `list_migrations` → File `supabase/migrations/<V>_cmm44_mp8_status_check_extend.sql` (name==version).

### Task B2: `v_claim_phase`-Spiegel
- [ ] `SELECT pg_get_viewdef('public.v_claim_phase'::regclass, true)` live ziehen.
- [ ] Im Terminal-`CASE` `abgelehnt_final`/`an_externe_kanzlei_uebergeben` ergänzen; Status-Regulierungs-Zweig (`in_kommunikation_vs`→versicherungskontakt, `abgelehnt`→nachforderung) NACH dem lexdrive-Zweig. Priorität bit-gleich zu A1-Step-6.
- [ ] DROP+CREATE (CREATE OR REPLACE ist append-only) + GRANTs; via Plugin.
- [ ] **Parity prüfen:** für Stichprobe Claims `getClaimLifecycle` == `v_claim_phase` (main+sub).

### Task B3: Backfill
- [ ] `UPDATE public.claims SET status='reguliert_vollstaendig' WHERE status='reguliert'` (idempotent, wert-geguarded). Bestehende `abgelehnt` belassen (= einfach).

---

## Phase C — UI + Verifikation (DB-gated)

### Task C1: Fallakte-Endzustand-UI
- [ ] Endzustand-Panel in `/faelle/[id]` lokalisieren (Trigger der 5 Actions; `grep -rn "markClaimAsReguliert\|markClaimAsAbgelehnt" src/app src/components`).
- [ ] Ablehnen-Trigger splitten: "Vorläufig ablehnen" (`final:false`) / "Endgültig ablehnen" (`final:true`).
- [ ] Buttons "Klage / Rechtsstreit" + "Verjährt" ergänzen (Rolle admin/KB, `primitives/*`+`shared/*`, keine handgerollten Buttons).

### Task C2: Smoke (Screenshot-Pflicht)
- [ ] Je Trigger in der Fallakte klicken → Phasen-Pipeline springt korrekt (Abschluss-Subs + Regulierung/nachforderung); Screenshot auswerten ([[feedback_smoke_screenshot_pflicht]]).
- [ ] Einfache vs. finale Ablehnung gegentesten (einfach bleibt Regulierung; final → Abschluss).
- [ ] Alle Portale wo Phase gerendert wird (admin/KB-Fallakte, Kanban, Kunde) auf Regression smoken.

---

## Self-Review

- **Spec-Coverage:** A1/A2 = Read-Model + Tests; A3 = Writer (alle 5 + 2 neue + final-Flag + Audit); B1-B3 = CHECK/View/Backfill; C1/C2 = UI + Smoke. Alle Spec-§3-Punkte abgedeckt. ✓
- **Placeholder-Scan:** Exakte CHECK-IN-Liste + View-Body bewusst execution-time (DB-gated, live ziehen) — kein vager Platzhalter, sondern dokumentierte DB-Abhängigkeit. ✓
- **Typ-Konsistenz:** Substate-Namen 1:1 zwischen A1 (`ABSCHLUSS_SUBSTATE`/`SUBPHASE_LABEL`/Type) und A3-Audit-Strings (`abschluss:abgelehnt_final` etc.) + B2-View. ✓
- **Reihenfolge:** A (Code, build-verifiziert) vor B/C; Deploy CHECK→Read-Model→Writer→Backfill (Spec §5). ✓

## Execution Handoff
- **Subagent-Driven (empfohlen):** ein Subagent je Task (A1→A2→A3→A4), Two-Stage-Review dazwischen.
- Phase A jetzt; Phase B/C wenn DB durabel stabil. Kein Deploy bis Branch komplett + via staging→main-Release (Content-verifiziert).
