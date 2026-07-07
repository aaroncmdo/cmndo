# Ops-Cockpit Phase 1c — Rich Fact-Editing (current values) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** Make the KB board's hover-split genuinely "voll editierbar" for the safe fact fields: `notizen`, `interne_notizen`, `schadens_hoehe_netto` are shown with their **current values** and editable in place. This restores the notes fields that Phase 1b removed (they were empty → blind-overwrite risk) — now correct, because the work-state view carries their current values.

**Architecture:** Extend the (own) `v_claim_workstate` view to also project the raw editable claims columns (via a `claims` join), keeping the RLS row-gate. Carry them on `ClaimWorkItem.editable`. `ClaimHoverCard` renders each editable field with its current value + inline edit (reusing the Phase-1b `updateClaimField` action, whose whitelist already covers all three).

**Tech Stack:** Next.js (App Router, breaking-changes version), Supabase (view via MCP plugin), TypeScript, Vitest.

## Global Constraints

- Branch off staging AFTER #3853 (Phase 1b) merges (Phase 1c consumes `updateClaimField` + `ClaimHoverCard`); until then it stacks on `kitta/ops-cockpit-phase1b-hover-edit`. PR against `staging`; never `main`. Commit per task.
- **🔒 CRITICAL — preserve the RLS gate.** The `CREATE OR REPLACE VIEW public.v_claim_workstate` in Task 1 MUST keep `WHERE public.claim_sichtbar_fuer_aktuellen_user(f.id)` and the `GRANT SELECT ... TO authenticated`. Dropping the WHERE re-introduces the ungated IDOR the guard caught (migration `20260707175047`). After applying, VERIFY `SELECT count(*) FROM public.audit_ungated_definer_views()` returns 0.
- DDL only via the Supabase MCP plugin (Regel 2): apply_migration → `list_migrations` → commit `supabase/migrations/<V>_<name>.sql` (== tracked version) → `execute_sql` verify. `v_claim_workstate` is our own view (this initiative) → `CREATE OR REPLACE` is allowed; do NOT touch `v_claim_phase`/`v_claim_full`/`v_claim_base`.
- **CREATE OR REPLACE rule:** existing columns must stay in the same order; new columns appended at the END only. Current view ends with `... vs_eskalationsstufe, fall_id`; append the new columns after `fall_id`.
- Server-action reuse: `updateClaimField` (Phase 1b, `@/app/mitarbeiter/claim-edit-actions`) already whitelists `notizen`/`interne_notizen`/`schadens_hoehe_netto` — no action change needed.
- All user-visible text in Umlauten. No new inline status/color maps. Claimondo tokens, `rounded-ios-*`. Tests: env=node (`renderToStaticMarkup` / pure helpers, no jsdom).
- Verified claims columns (2026-07-07): `notizen` (text), `interne_notizen` (text), `schadens_hoehe_netto` (numeric) all exist on `claims`.

---

## File Structure

- `supabase/migrations/<V>_v_claim_workstate_edit_fields.sql` — CREATE OR REPLACE (append edit fields, KEEP GATE + grant).
- `src/lib/ops/claim-workstate.types.ts` — add `edit_*` to `ClaimWorkstateRow`; add `editable` to `ClaimWorkItem`.
- `src/lib/ops/derive-claim-workflow-state.ts` + test — surface `editable`.
- `src/components/mitarbeiter/ClaimHoverCard.tsx` + test — render the 3 editable fields with current values.

---

### Task 1: Extend `v_claim_workstate` with raw editable fields (KEEP GATE)

**Files:** Create `supabase/migrations/<V>_v_claim_workstate_edit_fields.sql`

**Interfaces:** Produces `v_claim_workstate.edit_notizen (text)`, `.edit_interne_notizen (text)`, `.edit_schadens_hoehe_netto (numeric)`.

- [ ] **Step 1: apply_migration** — `name: "v_claim_workstate_edit_fields"`, query = the CURRENT view def (from `20260707180610`) with a `claims c` join and 3 appended columns, **gate preserved**:

```sql
CREATE OR REPLACE VIEW public.v_claim_workstate AS
SELECT
  f.id AS claim_id, f.claim_nummer, f.lead_id, f.kundenbetreuer_id, f.sv_id,
  f.main_phase, f.sub_phase, f.status, f.operative_status, f.ist_aktiv, f.kennzeichen,
  NULLIF(TRIM(COALESCE(f.kunde_vorname,'') || ' ' || COALESCE(f.kunde_nachname,'')),'') AS kunde_name,
  COALESCE(f.regulierung_betrag, f.regulierungs_betrag, f.gutachten_betrag) AS schadenhoehe,
  f.sa_unterschrieben, f.sv_zugewiesen_am, f.gutachten_eingegangen_am, f.anschlussschreiben_am,
  f.regulierung_am, f.abgeschlossen_am, f.storniert_am, f.updated_at, f.created_at,
  f.dokumente_vollstaendig_fuer_phase, f.vs_eskalationsstufe, f.fall_id,
  c.notizen               AS edit_notizen,
  c.interne_notizen       AS edit_interne_notizen,
  c.schadens_hoehe_netto  AS edit_schadens_hoehe_netto
FROM public.v_claim_full f
JOIN public.claims c ON c.id = f.id
WHERE public.claim_sichtbar_fuer_aktuellen_user(f.id);

GRANT SELECT ON public.v_claim_workstate TO authenticated;
```

- [ ] **Step 2: Verify gate + columns (READ).** `execute_sql`:
```sql
select
  (pg_get_viewdef('public.v_claim_workstate'::regclass,true) ilike '%claim_sichtbar_fuer_aktuellen_user%') as gated,
  (select count(*) from public.audit_ungated_definer_views()) as ungated_count,
  (select count(*) from information_schema.columns where table_name='v_claim_workstate' and column_name like 'edit_%') as edit_cols;
```
Expected: `gated=true, ungated_count=0, edit_cols=3`. If `ungated_count>0` → the gate was dropped; STOP and re-apply with the WHERE clause.

- [ ] **Step 3: list_migrations → commit the file** as `supabase/migrations/<V>_v_claim_workstate_edit_fields.sql` (== tracked version). Commit.

```bash
git add supabase/migrations/<V>_v_claim_workstate_edit_fields.sql
git commit -m "feat(ops): v_claim_workstate exposes raw editable fields (notizen/interne_notizen/schadens_hoehe_netto), gate preserved"
```

---

### Task 2: Carry editable fields on `ClaimWorkItem`

**Files:** Modify `src/lib/ops/claim-workstate.types.ts`, `src/lib/ops/derive-claim-workflow-state.ts` + test.

**Interfaces:** `ClaimWorkstateRow` gains `edit_notizen: string|null`, `edit_interne_notizen: string|null`, `edit_schadens_hoehe_netto: number|null`. `ClaimWorkItem` gains `editable: { notizen: string|null; interneNotizen: string|null; schadensHoeheNetto: number|null }`.

- [ ] **Step 1: Failing test** — add to `derive-claim-workflow-state.test.ts` base fixture `edit_notizen:'hallo', edit_interne_notizen:null, edit_schadens_hoehe_netto:4500,` and:
```ts
it('surfaced editable fields', () => {
  const wi = deriveClaimWorkflowState(base, NOW)
  expect(wi.editable).toEqual({ notizen: 'hallo', interneNotizen: null, schadensHoeheNetto: 4500 })
})
```
Run → FAIL.

- [ ] **Step 2: Implement** — add the 3 fields to `ClaimWorkstateRow`; add `editable` to `ClaimWorkItem`; in `deriveClaimWorkflowState` return `editable: { notizen: row.edit_notizen, interneNotizen: row.edit_interne_notizen, schadensHoeheNetto: row.edit_schadens_hoehe_netto }`.

- [ ] **Step 3: Run → PASS.** Also update `get-claim-workitems.test.ts` fixture with the 3 new `edit_*` fields (`null`). Run `npx vitest run src/lib/ops` → green. Commit.

```bash
git add src/lib/ops/claim-workstate.types.ts src/lib/ops/derive-claim-workflow-state.ts src/lib/ops/derive-claim-workflow-state.test.ts src/lib/ops/get-claim-workitems.test.ts
git commit -m "feat(ops): ClaimWorkItem.editable carries current editable field values"
```

---

### Task 3: Render all three fields with current values in `ClaimHoverCard`

**Files:** Modify `src/components/mitarbeiter/ClaimHoverCard.tsx` + test.

- [ ] **Step 1: Update the hover** — replace the single schadens_hoehe_netto `EditableRow` with three rows fed by `item.editable`:
```tsx
<div className="flex flex-col gap-2 border-t border-claimondo-border pt-2">
  <EditableRow claimId={item.id} field="schadens_hoehe_netto" initialValue={item.editable.schadensHoeheNetto} />
  <EditableRow claimId={item.id} field="notizen" initialValue={item.editable.notizen} />
  <EditableRow claimId={item.id} field="interne_notizen" initialValue={item.editable.interneNotizen} />
</div>
```
(`EditableRow` already accepts `string|number|null`. `FIELD_LABEL` already has all three.)

- [ ] **Step 2: Update the test** — extend the `item` fixture with `editable: { notizen: 'Kunde nicht erreicht', interneNotizen: null, schadensHoeheNetto: 4500 }` and assert the note's current value renders:
```ts
expect(html).toContain('Kunde nicht erreicht')
```
Run `npx vitest run src/components/mitarbeiter` → green.

- [ ] **Step 3: Verify + commit.** `npx tsc --noEmit` (0 errors in your files). `npm run check:status-registry` + `check:component-set` + `check:token-audit` → 0 new. Commit.

```bash
git add src/components/mitarbeiter/ClaimHoverCard.tsx src/components/mitarbeiter/ClaimHoverCard.test.tsx
git commit -m "feat(kb): hover-split edits notizen/interne_notizen/schadens_hoehe_netto with current values"
```

---

## Self-Review

**Spec coverage (§6 hover + §9 write, fact side):** all safe editable claims fields now shown-with-value + editable → Tasks 1–3. Completes the "voll editierbar" fact surface for KB.

**Deferred to Phase 1d (explicit):** the hard **phase-override** — `claims.phase_override` (CHECK-constrained to valid `ClaimMainPhase`) + `v_claim_phase` `COALESCE(phase_override, <derived main_phase>)` + `overrideClaimPhase` action + reason/audit + the override UI. Isolated because it modifies the SHARED `v_claim_phase` view (many consumers) and carries domain-modeling nuance (override main_phase while sub_phase stays derived) — deserves its own careful, coordinated plan. Cross-entity edits (vehicle kennzeichen, personen) also 1d+.

**Placeholder scan:** none. **Type consistency:** `edit_*` row fields (Task 2) map to `editable` (Task 2) consumed by the hover (Task 3); `updateClaimField` (Phase 1b) unchanged, whitelist already matches. **Risk:** the ONLY risk is the gate — Task 1 Step 2 explicitly verifies `audit_ungated_definer_views()=0` before proceeding. A `claims` join adds a per-row join over `v_claim_full`; acceptable (worklist is small + already gated per row).
