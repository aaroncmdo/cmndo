# Ops-Cockpit Phase 0 — Claim Work-State Read-Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested, additive read-foundation that turns a claim into a `ClaimWorkItem` (stage · sub-state · next-best-action · owner · overdue) — the data layer every cockpit (KB/Admin) will render, with zero UI and zero risk to existing views.

**Architecture:** One lean additive DB view `v_claim_workstate` (projection over the existing `v_claim_full`, which already flattens phase + owner + display + signals), consumed by a pure TS derivation `deriveClaimWorkflowState(row) → ClaimWorkItem`. Colors reuse the existing `fall-phase` status-registry domain + `SUBPHASE_LABEL`; only the **action layer** (`claimWorkflowMeta`: sub_phase → next-action/owner/CTA) is new. No writes, no override, no rollup, no lead-side in this plan — those are separate plans.

**Tech Stack:** Next.js (breaking-changes version — read `node_modules/next/dist/docs/` before Next code), Supabase (Postgres views via the Supabase MCP plugin), TypeScript, Vitest.

## Global Constraints

- **DDL only via the Supabase MCP plugin** (`mcp__plugin_supabase_supabase__apply_migration`), never CLI/raw `execute_sql`-DDL. After apply: `list_migrations` → read the tracked version `<V>` → commit the migration file as `supabase/migrations/<V>_<name>.sql` (filename == tracked version). `execute_sql` is READ-only for verification. (AGENTS.md Regel 2.)
- **Additive only.** Do NOT modify `v_claim_phase`, `v_claim_base`, `v_claim_full`, `v_faelle*`. Creating `v_claim_workstate` is a new object — it must not `CREATE OR REPLACE` any existing view. (Coordination: sessions `payment-ledger-*`, `sv-termine-canonical` are live on those views — see `BROADCAST-vclaimbase-vfaelle-ledger-central-live`.)
- **Never push `main`.** Work on branch `kitta/ops-cockpit-rebuild`; PR against `staging`. (AGENTS.md Regel 1.)
- **Auth-gated views read in USER context.** `v_claim_full`/`v_claim_workstate` inherit `claim_sichtbar_fuer_aktuellen_user` gating → query them with the request-scoped `createClient()` (RLS = the logged-in user), never `createAdminClient()`/service-role for the cockpit read path (service-role returns 0 rows).
- **Status colors only from `src/lib/status`** (the `check:status-registry` ratchet blocks new inline color maps). Reuse `fall-phase` domain + `SUBPHASE_LABEL`; do not hand-roll sub_phase colors.
- **UI text in Umlauten** (only relevant later; this plan is data-layer, labels come from `SUBPHASE_LABEL`).
- Verified sub_phase set (from `v_claim_phase` def, 2026-07-07): `sa_offen, vollmacht_offen, onboarding_offen, termin, besichtigung, gutachten, filmcheck, qc-pruefung, kanzlei_uebergabe, anschlussschreiben, versicherungskontakt, vs-kuerzt, nachbesichtigung-laeuft, nachforderung, auszahlung` + terminals (`erfolgreich_reguliert, storniert, klage_rechtsstreit, verjaehrt, abgelehnt_final, an_externe_kanzlei, termin_durchgefuehrt`). main_phase buckets: erfassung = {sa_offen, vollmacht_offen, onboarding_offen}; begutachtung = {termin, besichtigung, gutachten, filmcheck, qc-pruefung, kanzlei_uebergabe}; regulierung = {anschlussschreiben, versicherungskontakt, vs-kuerzt, nachbesichtigung-laeuft, nachforderung, auszahlung}; abschluss = else.

---

## File Structure

- `supabase/migrations/<V>_v_claim_workstate.sql` — NEW additive view.
- `src/lib/ops/claim-workstate.types.ts` — `ClaimWorkstateRow`, `ClaimWorkItem`, `ClaimNextActionCode`, `OwnerRole`, `WaitingOn`.
- `src/lib/ops/claim-workflow-meta.ts` — `claimWorkflowMeta` (sub_phase → action/owner/CTA) + `CLAIM_SLA_DAYS`.
- `src/lib/ops/claim-workflow-meta.test.ts` — completeness tests.
- `src/lib/ops/derive-claim-workflow-state.ts` — `deriveClaimWorkflowState(row) → ClaimWorkItem` (pure).
- `src/lib/ops/derive-claim-workflow-state.test.ts` — derivation tests.
- `src/lib/ops/get-claim-workitems.ts` — `getMyClaimWorkItems(supabase, opts)` query helper.
- `src/lib/ops/get-claim-workitems.test.ts` — helper test (mocked supabase).

Rationale: one `src/lib/ops/` module owns the work-state contract. Types/meta/derivation/query split by responsibility so each is testable in isolation and later cockpits import a stable surface.

---

### Task 1: `v_claim_workstate` additive view

**Files:**
- Create: `supabase/migrations/<V>_v_claim_workstate.sql`

**Interfaces:**
- Produces: view `public.v_claim_workstate` with columns `claim_id, claim_nummer, lead_id, kundenbetreuer_id, sv_id, main_phase, sub_phase, status, operative_status, ist_aktiv, kennzeichen, kunde_name, schadenhoehe, sa_unterschrieben, sv_zugewiesen_am, gutachten_eingegangen_am, anschlussschreiben_am, regulierung_am, abgeschlossen_am, storniert_am, updated_at, created_at, dokumente_vollstaendig_fuer_phase, vs_eskalationsstufe`. All source columns are verified present on `v_claim_full` (2026-07-07).

- [ ] **Step 1: Write the view SQL (projection over `v_claim_full`)**

```sql
-- v_claim_workstate: lean work-state projection over v_claim_full for the ops cockpits.
-- Additive, read-only. Inherits v_claim_full's RLS gating (claim_sichtbar_fuer_aktuellen_user).
CREATE VIEW public.v_claim_workstate AS
SELECT
  f.id                              AS claim_id,
  f.claim_nummer,
  f.lead_id,
  f.kundenbetreuer_id,
  f.sv_id,
  f.main_phase,
  f.sub_phase,
  f.status,
  f.operative_status,
  f.ist_aktiv,
  f.kennzeichen,
  NULLIF(TRIM(COALESCE(f.kunde_vorname, '') || ' ' || COALESCE(f.kunde_nachname, '')), '') AS kunde_name,
  COALESCE(f.regulierung_betrag, f.regulierungs_betrag, f.gutachten_betrag) AS schadenhoehe,
  f.sa_unterschrieben,
  f.sv_zugewiesen_am,
  f.gutachten_eingegangen_am,
  f.anschlussschreiben_am,
  f.regulierung_am,
  f.abgeschlossen_am,
  f.storniert_am,
  f.updated_at,
  f.created_at,
  f.dokumente_vollstaendig_fuer_phase,
  f.vs_eskalationsstufe
FROM public.v_claim_full f;
```

- [ ] **Step 2: Apply via the plugin (NOT execute_sql)**

Call `mcp__plugin_supabase_supabase__apply_migration({ name: "v_claim_workstate", query: <the SQL above> })`.
Expected: success (creates the view + tracks it in `schema_migrations`).

- [ ] **Step 3: Read the tracked version + commit the migration file**

Call `mcp__plugin_supabase_supabase__list_migrations`, read the newest version `<V>` the plugin assigned. Create `supabase/migrations/<V>_v_claim_workstate.sql` containing exactly the Step 1 SQL. (Filename MUST equal `<V>` to avoid Twin-Drift.)

```bash
git add supabase/migrations/<V>_v_claim_workstate.sql
git commit -m "feat(ops): v_claim_workstate additive read-projection over v_claim_full"
```

- [ ] **Step 4: Verify the view exists and shape is correct (READ)**

Call `execute_sql`:
```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='v_claim_workstate' order by ordinal_position;
```
Expected: 24 columns matching the Interfaces list above. (Row-count will be 0 under service-role due to RLS gating — that is correct, not a failure.)

---

### Task 2: Work-state types

**Files:**
- Create: `src/lib/ops/claim-workstate.types.ts`

**Interfaces:**
- Consumes: `ClaimSubPhase`, `ClaimMainPhase` from `@/lib/claims/lifecycle` (reuse — do NOT redefine).
- Produces: `ClaimWorkstateRow`, `OwnerRole`, `WaitingOn`, `ClaimNextActionCode`, `ClaimWorkItem`.

- [ ] **Step 1: Confirm the reused lifecycle types exist**

Read `src/lib/claims/lifecycle.ts`. Confirm exported `ClaimSubPhase` (union incl. the 15 sub_phases + terminals), `ClaimMainPhase` (`'erfassung'|'begutachtung'|'regulierung'|'abschluss'`), `toClaimSubPhase(x): ClaimSubPhase`, `toClaimMainPhase(x): ClaimMainPhase`, `SUBPHASE_LABEL`, `MAIN_PHASE_LABEL`. If `ClaimSubPhase` is missing any verified sub_phase value, note it (do not silently proceed) — the derivation completeness test (Task 4) will also catch gaps.

- [ ] **Step 2: Write the types**

```ts
// src/lib/ops/claim-workstate.types.ts
// Work-state contract for the ops cockpits (Claim side). Read-model shapes only.
import type { ClaimMainPhase, ClaimSubPhase } from '@/lib/claims/lifecycle'

/** One row of v_claim_workstate (see supabase/migrations/*_v_claim_workstate.sql). */
export interface ClaimWorkstateRow {
  claim_id: string
  claim_nummer: string | null
  lead_id: string | null
  kundenbetreuer_id: string | null
  sv_id: string | null
  main_phase: string | null
  sub_phase: string | null
  status: string | null
  operative_status: string | null
  ist_aktiv: boolean | null
  kennzeichen: string | null
  kunde_name: string | null
  schadenhoehe: number | null
  sa_unterschrieben: boolean | null
  sv_zugewiesen_am: string | null
  gutachten_eingegangen_am: string | null
  anschlussschreiben_am: string | null
  regulierung_am: string | null
  abgeschlossen_am: string | null
  storniert_am: string | null
  updated_at: string | null
  created_at: string | null
  dokumente_vollstaendig_fuer_phase: string | null
  vs_eskalationsstufe: string | null
}

/** Wer ist als Naechstes am Zug. */
export type OwnerRole = 'kb' | 'sv' | 'dispatch' | 'kanzlei' | 'intern' | 'none'
/** Worauf der Fall wartet (blockiert). */
export type WaitingOn = 'kunde' | 'sv' | 'vs' | 'kanzlei' | 'intern' | 'none'

/** Naechste-beste-Aktion je Claim-Sub-Phase. Keyed nvm sub_phase in claimWorkflowMeta. */
export type ClaimNextActionCode =
  | 'sa_anfordern' | 'vollmacht_anfordern' | 'onboarding_treiben'
  | 'sv_termin_setzen' | 'besichtigung_laeuft' | 'gutachten_ausstehend'
  | 'filmcheck' | 'qc_pruefung' | 'kanzlei_uebergeben'
  | 'anschlussschreiben' | 'vs_nachfassen' | 'kuerzung_pruefen'
  | 'nachbesichtigung' | 'nachforderung_treiben' | 'auszahlung_pruefen'
  | 'abgeschlossen'

/** Das vereinheitlichte Cockpit-Item (Claim-Zweig; Lead-Zweig kommt in einem eigenen Plan). */
export interface ClaimWorkItem {
  kind: 'claim'
  id: string
  claimNummer: string | null
  stage: ClaimMainPhase
  subState: ClaimSubPhase
  nextActionCode: ClaimNextActionCode
  ownerRole: OwnerRole
  waitingOn: WaitingOn
  isOverdue: boolean
  overdueSinceDays: number | null
  display: { title: string; kennzeichen: string | null; schadenhoehe: number | null }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` (filter to this file). Expected: no errors in `src/lib/ops/claim-workstate.types.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ops/claim-workstate.types.ts
git commit -m "feat(ops): claim work-state types (ClaimWorkstateRow, ClaimWorkItem)"
```

---

### Task 3: `claimWorkflowMeta` — the action layer (sub_phase → next-action/owner/CTA)

**Files:**
- Create: `src/lib/ops/claim-workflow-meta.ts`
- Test: `src/lib/ops/claim-workflow-meta.test.ts`

**Interfaces:**
- Consumes: `ClaimSubPhase` from `@/lib/claims/lifecycle`; `ClaimNextActionCode, OwnerRole, WaitingOn` from `./claim-workstate.types`.
- Produces: `CLAIM_WORKFLOW_META: Record<ClaimSubPhase, ClaimWorkflowMetaEntry>`, `CLAIM_SLA_DAYS: Partial<Record<ClaimSubPhase, number>>`, type `ClaimWorkflowMetaEntry`.

- [ ] **Step 1: Write the failing completeness test**

```ts
// src/lib/ops/claim-workflow-meta.test.ts
import { describe, it, expect } from 'vitest'
import { CLAIM_WORKFLOW_META, CLAIM_SLA_DAYS } from './claim-workflow-meta'
import { ALL_CLAIM_SUB_PHASES } from '@/lib/claims/lifecycle'

describe('claimWorkflowMeta', () => {
  it('deckt jede ClaimSubPhase ab', () => {
    for (const sp of ALL_CLAIM_SUB_PHASES) expect(CLAIM_WORKFLOW_META[sp]).toBeDefined()
  })
  it('erfassung-Phasen warten auf den Kunden', () => {
    for (const sp of ['sa_offen', 'vollmacht_offen', 'onboarding_offen'] as const)
      expect(CLAIM_WORKFLOW_META[sp].waitingOn).toBe('kunde')
  })
  it('SLA-Schwellen sind positive Tage', () => {
    for (const v of Object.values(CLAIM_SLA_DAYS)) expect(v).toBeGreaterThan(0)
  })
})
```

> Note: if `ALL_CLAIM_SUB_PHASES` does not yet exist in `lifecycle.ts`, add it there as `export const ALL_CLAIM_SUB_PHASES = [...] as const satisfies readonly ClaimSubPhase[]` using the verified sub_phase set (Global Constraints) — this is the single source of truth for exhaustiveness.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/ops/claim-workflow-meta.test.ts`
Expected: FAIL (module not found / CLAIM_WORKFLOW_META undefined).

- [ ] **Step 3: Write the meta**

```ts
// src/lib/ops/claim-workflow-meta.ts
// Aktions-Layer: pro Claim-Sub-Phase die naechste-beste-Aktion, der Owner, worauf gewartet
// wird, und die CTA-Copy. Farbe/Label kommen NICHT hierher (die liefert die fall-phase-
// Registry-Domain + SUBPHASE_LABEL) — hier nur die Handlung.
import type { ClaimSubPhase } from '@/lib/claims/lifecycle'
import type { ClaimNextActionCode, OwnerRole, WaitingOn } from './claim-workstate.types'

export interface ClaimWorkflowMetaEntry {
  nextActionCode: ClaimNextActionCode
  ownerRole: OwnerRole
  waitingOn: WaitingOn
  ctaLabel: string // UI-sichtbar -> Umlaute
}

export const CLAIM_WORKFLOW_META: Record<ClaimSubPhase, ClaimWorkflowMetaEntry> = {
  sa_offen:                 { nextActionCode: 'sa_anfordern',        ownerRole: 'kb',       waitingOn: 'kunde',  ctaLabel: 'Schadenanzeige anfordern' },
  vollmacht_offen:          { nextActionCode: 'vollmacht_anfordern', ownerRole: 'kb',       waitingOn: 'kunde',  ctaLabel: 'Vollmacht anfordern' },
  onboarding_offen:         { nextActionCode: 'onboarding_treiben',  ownerRole: 'kb',       waitingOn: 'kunde',  ctaLabel: 'Onboarding abschließen' },
  termin:                   { nextActionCode: 'sv_termin_setzen',    ownerRole: 'dispatch', waitingOn: 'sv',     ctaLabel: 'SV-Termin setzen' },
  besichtigung:             { nextActionCode: 'besichtigung_laeuft', ownerRole: 'sv',       waitingOn: 'sv',     ctaLabel: 'Besichtigung läuft' },
  gutachten:                { nextActionCode: 'gutachten_ausstehend',ownerRole: 'sv',       waitingOn: 'sv',     ctaLabel: 'Gutachten anfordern' },
  filmcheck:                { nextActionCode: 'filmcheck',           ownerRole: 'intern',   waitingOn: 'intern', ctaLabel: 'Filmcheck prüfen' },
  'qc-pruefung':            { nextActionCode: 'qc_pruefung',         ownerRole: 'intern',   waitingOn: 'intern', ctaLabel: 'QC prüfen' },
  kanzlei_uebergabe:        { nextActionCode: 'kanzlei_uebergeben',  ownerRole: 'kb',       waitingOn: 'kanzlei',ctaLabel: 'An Kanzlei übergeben' },
  anschlussschreiben:       { nextActionCode: 'anschlussschreiben',  ownerRole: 'kb',       waitingOn: 'vs',     ctaLabel: 'Anschlussschreiben senden' },
  versicherungskontakt:     { nextActionCode: 'vs_nachfassen',       ownerRole: 'kb',       waitingOn: 'vs',     ctaLabel: 'Bei Versicherer nachfassen' },
  'vs-kuerzt':              { nextActionCode: 'kuerzung_pruefen',    ownerRole: 'kb',       waitingOn: 'kb',     ctaLabel: 'Kürzung prüfen' },
  'nachbesichtigung-laeuft':{ nextActionCode: 'nachbesichtigung',    ownerRole: 'sv',       waitingOn: 'sv',     ctaLabel: 'Nachbesichtigung läuft' },
  nachforderung:            { nextActionCode: 'nachforderung_treiben',ownerRole: 'kb',      waitingOn: 'vs',     ctaLabel: 'Nachforderung treiben' },
  auszahlung:               { nextActionCode: 'auszahlung_pruefen',  ownerRole: 'kb',       waitingOn: 'none',   ctaLabel: 'Auszahlung prüfen' },
  // Terminals -> abgeschlossen (kein Handlungsbedarf)
  erfolgreich_reguliert:    { nextActionCode: 'abgeschlossen', ownerRole: 'none', waitingOn: 'none', ctaLabel: 'Abgeschlossen' },
  storniert:                { nextActionCode: 'abgeschlossen', ownerRole: 'none', waitingOn: 'none', ctaLabel: 'Storniert' },
  klage_rechtsstreit:       { nextActionCode: 'abgeschlossen', ownerRole: 'kanzlei', waitingOn: 'kanzlei', ctaLabel: 'Klage/Rechtsstreit' },
  verjaehrt:                { nextActionCode: 'abgeschlossen', ownerRole: 'none', waitingOn: 'none', ctaLabel: 'Verjährt' },
  abgelehnt_final:          { nextActionCode: 'abgeschlossen', ownerRole: 'none', waitingOn: 'none', ctaLabel: 'Abgelehnt' },
  an_externe_kanzlei:       { nextActionCode: 'abgeschlossen', ownerRole: 'kanzlei', waitingOn: 'kanzlei', ctaLabel: 'Externe Kanzlei' },
  termin_durchgefuehrt:     { nextActionCode: 'abgeschlossen', ownerRole: 'none', waitingOn: 'none', ctaLabel: 'Termin durchgeführt' },
}

/** Default-SLA je Sub-Phase (Tage bis „ueberfaellig"). Kalibrierbar (Spec §13). */
export const CLAIM_SLA_DAYS: Partial<Record<ClaimSubPhase, number>> = {
  sa_offen: 3, vollmacht_offen: 3, onboarding_offen: 5,
  termin: 4, besichtigung: 3, gutachten: 7, filmcheck: 2, 'qc-pruefung': 2, kanzlei_uebergabe: 3,
  anschlussschreiben: 5, versicherungskontakt: 7, 'vs-kuerzt': 5, 'nachbesichtigung-laeuft': 7,
  nachforderung: 7, auszahlung: 5,
}
```

> The exact `ClaimSubPhase` union keys must match `lifecycle.ts`. If a terminal value there is named differently (e.g. `an_externe_kanzlei_uebergeben` vs `an_externe_kanzlei`), align the key to `lifecycle.ts` — the completeness test enforces this.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/ops/claim-workflow-meta.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops/claim-workflow-meta.ts src/lib/ops/claim-workflow-meta.test.ts src/lib/claims/lifecycle.ts
git commit -m "feat(ops): claimWorkflowMeta - next-action/owner/CTA per sub_phase + SLA defaults"
```

---

### Task 4: `deriveClaimWorkflowState` — pure derivation

**Files:**
- Create: `src/lib/ops/derive-claim-workflow-state.ts`
- Test: `src/lib/ops/derive-claim-workflow-state.test.ts`

**Interfaces:**
- Consumes: `ClaimWorkstateRow, ClaimWorkItem` from `./claim-workstate.types`; `CLAIM_WORKFLOW_META, CLAIM_SLA_DAYS` from `./claim-workflow-meta`; `toClaimSubPhase, toClaimMainPhase` from `@/lib/claims/lifecycle`.
- Produces: `deriveClaimWorkflowState(row: ClaimWorkstateRow, now?: Date): ClaimWorkItem`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/ops/derive-claim-workflow-state.test.ts
import { describe, it, expect } from 'vitest'
import { deriveClaimWorkflowState } from './derive-claim-workflow-state'
import type { ClaimWorkstateRow } from './claim-workstate.types'

const base: ClaimWorkstateRow = {
  claim_id: 'c1', claim_nummer: 'CLM-1', lead_id: null, kundenbetreuer_id: 'kb1', sv_id: null,
  main_phase: 'begutachtung', sub_phase: 'gutachten', status: 'in_bearbeitung', operative_status: null,
  ist_aktiv: true, kennzeichen: 'K-AB 1', kunde_name: 'Müller', schadenhoehe: 4500,
  sa_unterschrieben: true, sv_zugewiesen_am: '2026-06-01T00:00:00Z', gutachten_eingegangen_am: null,
  anschlussschreiben_am: null, regulierung_am: null, abgeschlossen_am: null, storniert_am: null,
  updated_at: '2026-06-01T00:00:00Z', created_at: '2026-05-20T00:00:00Z',
  dokumente_vollstaendig_fuer_phase: null, vs_eskalationsstufe: null,
}
const NOW = new Date('2026-06-15T00:00:00Z')

describe('deriveClaimWorkflowState', () => {
  it('mappt sub_phase auf nextActionCode/owner via meta', () => {
    const wi = deriveClaimWorkflowState(base, NOW)
    expect(wi.kind).toBe('claim')
    expect(wi.stage).toBe('begutachtung')
    expect(wi.subState).toBe('gutachten')
    expect(wi.nextActionCode).toBe('gutachten_ausstehend')
    expect(wi.ownerRole).toBe('sv')
    expect(wi.waitingOn).toBe('sv')
  })
  it('markiert ueberfaellig, wenn phase_since > SLA', () => {
    // gutachten SLA=7d; sv_zugewiesen_am 2026-06-01, NOW 2026-06-15 => 14d > 7 => overdue
    const wi = deriveClaimWorkflowState(base, NOW)
    expect(wi.isOverdue).toBe(true)
    expect(wi.overdueSinceDays).toBeGreaterThanOrEqual(14)
  })
  it('ist nicht ueberfaellig innerhalb der SLA', () => {
    const wi = deriveClaimWorkflowState({ ...base, sv_zugewiesen_am: '2026-06-13T00:00:00Z' }, NOW)
    expect(wi.isOverdue).toBe(false)
  })
  it('Terminal-Phase = abgeschlossen, kein overdue', () => {
    const wi = deriveClaimWorkflowState({ ...base, main_phase: 'abschluss', sub_phase: 'erfolgreich_reguliert' }, NOW)
    expect(wi.nextActionCode).toBe('abgeschlossen')
    expect(wi.isOverdue).toBe(false)
  })
  it('display.title faellt auf claim_nummer zurueck, wenn kein Name', () => {
    const wi = deriveClaimWorkflowState({ ...base, kunde_name: null }, NOW)
    expect(wi.display.title).toBe('CLM-1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/ops/derive-claim-workflow-state.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the derivation**

```ts
// src/lib/ops/derive-claim-workflow-state.ts
// Reine Ableitung: v_claim_workstate-Zeile -> ClaimWorkItem. Kein I/O, testbar.
import { toClaimMainPhase, toClaimSubPhase, type ClaimSubPhase } from '@/lib/claims/lifecycle'
import { CLAIM_WORKFLOW_META, CLAIM_SLA_DAYS } from './claim-workflow-meta'
import type { ClaimWorkItem, ClaimWorkstateRow } from './claim-workstate.types'

const MS_PER_DAY = 86_400_000

/** Bester verfuegbarer „seit wann in dieser Phase"-Zeitstempel (Heuristik, v_claim_full-Spalten). */
function phaseSince(row: ClaimWorkstateRow, sub: ClaimSubPhase): string | null {
  if (sub === 'anschlussschreiben') return row.anschlussschreiben_am ?? row.updated_at
  if (sub === 'gutachten' || sub === 'termin' || sub === 'besichtigung') return row.sv_zugewiesen_am ?? row.updated_at
  return row.updated_at ?? row.created_at
}

export function deriveClaimWorkflowState(row: ClaimWorkstateRow, now: Date = new Date()): ClaimWorkItem {
  const stage = toClaimMainPhase(row.main_phase)
  const subState = toClaimSubPhase(row.sub_phase)
  const meta = CLAIM_WORKFLOW_META[subState]

  const sla = CLAIM_SLA_DAYS[subState]
  const since = phaseSince(row, subState)
  let overdueSinceDays: number | null = null
  let isOverdue = false
  if (sla != null && since) {
    const days = Math.floor((now.getTime() - new Date(since).getTime()) / MS_PER_DAY)
    overdueSinceDays = days
    isOverdue = days > sla
  }

  return {
    kind: 'claim',
    id: row.claim_id,
    claimNummer: row.claim_nummer,
    stage,
    subState,
    nextActionCode: meta.nextActionCode,
    ownerRole: meta.ownerRole,
    waitingOn: meta.waitingOn,
    isOverdue,
    overdueSinceDays,
    display: {
      title: row.kunde_name ?? row.claim_nummer ?? row.claim_id,
      kennzeichen: row.kennzeichen,
      schadenhoehe: row.schadenhoehe,
    },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/ops/derive-claim-workflow-state.test.ts`
Expected: PASS (5 tests). If `toClaimSubPhase` normalises an unknown sub_phase to a default that breaks the terminal test, align the terminal keys with `lifecycle.ts` (Task 3 note).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops/derive-claim-workflow-state.ts src/lib/ops/derive-claim-workflow-state.test.ts
git commit -m "feat(ops): deriveClaimWorkflowState (pure claim work-state derivation, TDD)"
```

---

### Task 5: `getMyClaimWorkItems` query helper

**Files:**
- Create: `src/lib/ops/get-claim-workitems.ts`
- Test: `src/lib/ops/get-claim-workitems.test.ts`

**Interfaces:**
- Consumes: `deriveClaimWorkflowState`; `ClaimWorkItem, ClaimWorkstateRow` types; a Supabase client (request-scoped).
- Produces: `getMyClaimWorkItems(supabase, opts: { kundenbetreuerId?: string }): Promise<{ ok: true; items: ClaimWorkItem[] } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test (mocked supabase)**

```ts
// src/lib/ops/get-claim-workitems.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getMyClaimWorkItems } from './get-claim-workitems'
import type { ClaimWorkstateRow } from './claim-workstate.types'

function mockSupabase(rows: ClaimWorkstateRow[], error: unknown = null) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error })),
  }
  return { from: vi.fn(() => chain) } as any
}
const row: ClaimWorkstateRow = {
  claim_id: 'c1', claim_nummer: 'CLM-1', lead_id: null, kundenbetreuer_id: 'kb1', sv_id: null,
  main_phase: 'begutachtung', sub_phase: 'gutachten', status: null, operative_status: null, ist_aktiv: true,
  kennzeichen: 'K-1', kunde_name: 'Müller', schadenhoehe: 100, sa_unterschrieben: true,
  sv_zugewiesen_am: null, gutachten_eingegangen_am: null, anschlussschreiben_am: null, regulierung_am: null,
  abgeschlossen_am: null, storniert_am: null, updated_at: null, created_at: null,
  dokumente_vollstaendig_fuer_phase: null, vs_eskalationsstufe: null,
}

describe('getMyClaimWorkItems', () => {
  it('liefert abgeleitete WorkItems', async () => {
    const res = await getMyClaimWorkItems(mockSupabase([row]), { kundenbetreuerId: 'kb1' })
    expect(res.ok).toBe(true)
    if (res.ok) { expect(res.items).toHaveLength(1); expect(res.items[0].nextActionCode).toBe('gutachten_ausstehend') }
  })
  it('gibt {ok:false} bei DB-Fehler', async () => {
    const res = await getMyClaimWorkItems(mockSupabase([], { message: 'boom' }), {})
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/ops/get-claim-workitems.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the helper**

```ts
// src/lib/ops/get-claim-workitems.ts
// Liest v_claim_workstate (im USER-Kontext -> RLS greift) und leitet WorkItems ab.
// Ergebnis-Objekt statt throw (AGENTS.md Server-Action-Pattern).
import type { SupabaseClient } from '@supabase/supabase-js'
import { deriveClaimWorkflowState } from './derive-claim-workflow-state'
import type { ClaimWorkItem, ClaimWorkstateRow } from './claim-workstate.types'

export async function getMyClaimWorkItems(
  supabase: SupabaseClient,
  opts: { kundenbetreuerId?: string },
): Promise<{ ok: true; items: ClaimWorkItem[] } | { ok: false; error: string }> {
  let q = supabase.from('v_claim_workstate').select('*').eq('ist_aktiv', true)
  if (opts.kundenbetreuerId) q = q.eq('kundenbetreuer_id', opts.kundenbetreuerId)
  const { data, error } = await q.order('updated_at', { ascending: true })
  if (error) return { ok: false, error: error.message }
  const items = (data as ClaimWorkstateRow[]).map((r) => deriveClaimWorkflowState(r))
  return { ok: true, items }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/ops/get-claim-workitems.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Full typecheck + ops test sweep + ratchets**

Run: `npx vitest run src/lib/ops` (Expected: all pass), then `npx tsc --noEmit` (Expected: no new errors in `src/lib/ops/**`), then `npm run check:status-registry` and `npm run check:component-set` (Expected: 0 new — this plan adds no inline color maps or components).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ops/get-claim-workitems.ts src/lib/ops/get-claim-workitems.test.ts
git commit -m "feat(ops): getMyClaimWorkItems - read v_claim_workstate -> ClaimWorkItem[]"
```

---

## Self-Review

**Spec coverage (this plan = Phase 0 read-foundation slice):**
- §3 Layer-1 Read-Detail (Claim) → Task 1 (`v_claim_workstate`) + Task 4 (`deriveClaimWorkflowState`) + Task 5 (query). ✓
- §4.4 `WorkItem` (Claim branch, discriminated by `kind:'claim'`) → Task 2. ✓
- §4.5 Registry / action layer → Task 3 (`claimWorkflowMeta`; colors reuse existing `fall-phase` domain — no new color map). ✓
- Additive-only / no view-clobber (§12 coordination) → Task 1 uses `CREATE VIEW` (new object), Global Constraints forbid touching existing views. ✓
- **Deferred to later plans (explicitly out of scope here):** `v_lead_workstate` + lead derivation (Dispatch plan); `v_ops_rollup` (Admin plan); `phase_override` + `v_claim_phase` COALESCE + write-actions + audit (Write/Override plan — the collision-risky DDL, coordinated separately); status-consolidation of `operative_status`/`work_state` (own investigation task — note: `operative_status` is a live `v_claim_phase` driver, so it is NOT droppable; `work_state` usage still to be audited). KB/Admin cockpit UI (Phases 1/2).

**Placeholder scan:** No TBD/TODO. Two conditional notes ("if `ClaimSubPhase` missing a value…", "align terminal keys") are guarded by the completeness test, not placeholders — they instruct exact alignment.

**Type consistency:** `ClaimWorkstateRow` fields (Task 2) are consumed verbatim in Tasks 4–5; `ClaimWorkItem` shape produced in Task 4 is asserted in Tasks 4–5 tests; `CLAIM_WORKFLOW_META`/`CLAIM_SLA_DAYS` names consistent across Tasks 3–4. View column list (Task 1) == `ClaimWorkstateRow` (Task 2), both 24 fields.

**Open dependency:** `ALL_CLAIM_SUB_PHASES` + terminal-key names in `lifecycle.ts` must match the verified set — Task 3 Step 1 confirms/extends; the completeness test enforces exhaustiveness.
