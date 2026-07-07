# Ops-Cockpit Phase 1a — KB Work-State Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / executing-plans. Steps use `- [ ]`.

**Goal:** Replace the flat "Meine Fälle" list on `/mitarbeiter` with a work-state-driven **phase-column board** (Kanban) whose cards show the next-best-action + overdue, driven by the Phase-0 foundation (`getMyClaimWorkItems` → `ClaimWorkItem[]`). This is the first visible KB cockpit piece. (Hover-Split inline editing = Phase 1b; needs the write layer.)

**Architecture:** Server component `/mitarbeiter/page.tsx` calls `getMyClaimWorkItems(supabase, { kundenbetreuerId: user.id })` and passes `ClaimWorkItem[]` to a new client component `MeineArbeitBoard`, which renders 3 phase columns (Erfassung/Begutachtung/Regulierung) of cards. Reuses `FallPhaseBadge` (colors) + `CLAIM_WORKFLOW_META` (action labels) — no new status/color logic. Card links to `/faelle/[fall_id]`.

**Tech Stack:** Next.js (App Router, breaking-changes version — read `node_modules/next/dist/docs/` before Next-specific code), React client components, Tailwind (Claimondo tokens), Supabase, Vitest.

## Global Constraints

- Branch `kitta/ops-cockpit-rebuild` (already checked out); commit per task; do NOT push `main`.
- **Reuse, do not re-roll:** colors via `@/components/shared/FallPhaseBadge` (sub_phase) — add NO inline status/color maps (the `check:status-registry` ratchet blocks them). Action labels from `CLAIM_WORKFLOW_META[subState].ctaLabel` (from `@/lib/ops/claim-workflow-meta`). Reference pattern for the board markup: `src/app/kanzlei/kanban/KanbanBoardClient.tsx` (phase-column layout).
- **All user-visible text in Umlauten** (ä/ö/ü/ß) — column titles from `MAIN_PHASE_LABEL` (`@/lib/claims/lifecycle`).
- DDL only via the Supabase MCP plugin (Regel 2: apply_migration → `list_migrations` → commit file `supabase/migrations/<V>_<name>.sql` == tracked version). Modifying `v_claim_workstate` (our own view from this branch) via `CREATE OR REPLACE VIEW` is allowed; do NOT touch other views.
- Read `v_claim_workstate` in USER context (`createClient()`, RLS) — never service-role.
- Foundation contract to consume (Phase 0, this branch): `getMyClaimWorkItems(supabase, { kundenbetreuerId?})` → `{ ok:true; items: ClaimWorkItem[] } | { ok:false; error }`. `ClaimWorkItem = { kind:'claim', id, claimNummer, stage: ClaimMainPhase, subState: ClaimSubPhase, nextActionCode, ownerRole, waitingOn, isOverdue, overdueSinceDays, display:{title, kennzeichen, schadenhoehe} }`.

---

## File Structure

- `supabase/migrations/<V>_v_claim_workstate_add_fall_id.sql` — CREATE OR REPLACE our view with `fall_id` appended.
- `src/lib/ops/claim-workstate.types.ts` — add `fall_id` to `ClaimWorkstateRow`; add `fallId` to `ClaimWorkItem`.
- `src/lib/ops/derive-claim-workflow-state.ts` — surface `fallId` on the item.
- `src/lib/ops/derive-claim-workflow-state.test.ts` — assert `fallId` mapping.
- `src/components/mitarbeiter/MeineArbeitBoard.tsx` — NEW client board component.
- `src/components/mitarbeiter/MeineArbeitBoard.test.tsx` — render tests (element-type assertions, no DOM env needed if using pure render helpers; else vitest jsdom).
- `src/app/mitarbeiter/page.tsx` — wire the board in place of the "Meine Fälle" Panel body.

---

### Task 1: Extend foundation with `fall_id`

**Files:**
- Create: `supabase/migrations/<V>_v_claim_workstate_add_fall_id.sql`
- Modify: `src/lib/ops/claim-workstate.types.ts`, `src/lib/ops/derive-claim-workflow-state.ts`, `src/lib/ops/derive-claim-workflow-state.test.ts`

**Interfaces:**
- Produces: `v_claim_workstate.fall_id (uuid)`; `ClaimWorkstateRow.fall_id: string | null`; `ClaimWorkItem.fallId: string | null`.

- [ ] **Step 1: CREATE OR REPLACE the view with `fall_id` (from v_claim_full)**

Apply via `apply_migration({ name: "v_claim_workstate_add_fall_id", query: ... })` — same SELECT as the existing `v_claim_workstate` plus `f.fall_id` appended as the LAST column (CREATE OR REPLACE requires unchanged existing column order + additions at the end):

```sql
CREATE OR REPLACE VIEW public.v_claim_workstate AS
SELECT
  f.id AS claim_id, f.claim_nummer, f.lead_id, f.kundenbetreuer_id, f.sv_id,
  f.main_phase, f.sub_phase, f.status, f.operative_status, f.ist_aktiv,
  f.kennzeichen,
  NULLIF(TRIM(COALESCE(f.kunde_vorname,'') || ' ' || COALESCE(f.kunde_nachname,'')),'') AS kunde_name,
  COALESCE(f.regulierung_betrag, f.regulierungs_betrag, f.gutachten_betrag) AS schadenhoehe,
  f.sa_unterschrieben, f.sv_zugewiesen_am, f.gutachten_eingegangen_am, f.anschlussschreiben_am,
  f.regulierung_am, f.abgeschlossen_am, f.storniert_am, f.updated_at, f.created_at,
  f.dokumente_vollstaendig_fuer_phase, f.vs_eskalationsstufe,
  f.fall_id
FROM public.v_claim_full f;
```
Then `list_migrations` → read `<V>` → create `supabase/migrations/<V>_v_claim_workstate_add_fall_id.sql` with the exact SQL. Verify with `execute_sql`: `select column_name from information_schema.columns where table_name='v_claim_workstate' and column_name='fall_id';` → 1 row.

- [ ] **Step 2: Add `fall_id` to the row type + `fallId` to the item (write the failing test first)**

In `derive-claim-workflow-state.test.ts`, add to the `base` fixture `fall_id: 'f1',` and a new test:
```ts
it('surfaced fallId from the row', () => {
  expect(deriveClaimWorkflowState(base, NOW).fallId).toBe('f1')
})
```
Run: `npx vitest run src/lib/ops/derive-claim-workflow-state.test.ts` → FAIL (fallId undefined + type error).

- [ ] **Step 3: Implement**

`claim-workstate.types.ts`: add `fall_id: string | null` to `ClaimWorkstateRow`; add `fallId: string | null` to `ClaimWorkItem`.
`derive-claim-workflow-state.ts`: in the returned object add `fallId: row.fall_id,`.

- [ ] **Step 4: Green + commit**

Run: `npx vitest run src/lib/ops` → all pass. `npx tsc --noEmit` (ignore unrelated pre-existing errors outside `src/lib/ops`).
```bash
git add supabase/migrations/<V>_v_claim_workstate_add_fall_id.sql src/lib/ops/claim-workstate.types.ts src/lib/ops/derive-claim-workflow-state.ts src/lib/ops/derive-claim-workflow-state.test.ts
git commit -m "feat(ops): add fall_id to v_claim_workstate + ClaimWorkItem (board deep-link)"
```

---

### Task 2: `MeineArbeitBoard` client component

**Files:**
- Create: `src/components/mitarbeiter/MeineArbeitBoard.tsx`
- Test: `src/components/mitarbeiter/MeineArbeitBoard.test.tsx`

**Interfaces:**
- Consumes: `ClaimWorkItem` (`@/lib/ops/claim-workstate.types`), `CLAIM_WORKFLOW_META` (`@/lib/ops/claim-workflow-meta`), `MAIN_PHASE_LABEL` + `type ClaimMainPhase` (`@/lib/claims/lifecycle`), `FallPhaseBadge` (`@/components/shared/FallPhaseBadge`).
- Produces: `export default function MeineArbeitBoard({ items }: { items: ClaimWorkItem[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/mitarbeiter/MeineArbeitBoard.test.tsx  (vitest, jsdom)
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MeineArbeitBoard from './MeineArbeitBoard'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'

// FallPhaseBadge pulls from the status registry; stub to a plain span to keep the test env-light.
vi.mock('@/components/shared/FallPhaseBadge', () => ({ default: ({ subPhase }: { subPhase: string }) => <span>{subPhase}</span> }))

const item = (over: Partial<ClaimWorkItem> = {}): ClaimWorkItem => ({
  kind: 'claim', id: 'c1', fallId: 'f1', claimNummer: 'CLM-1', stage: 'begutachtung', subState: 'gutachten',
  nextActionCode: 'gutachten_ausstehend', ownerRole: 'sv', waitingOn: 'sv', isOverdue: true, overdueSinceDays: 14,
  display: { title: 'Müller', kennzeichen: 'K-AB 1', schadenhoehe: 4500 }, ...over,
})

describe('MeineArbeitBoard', () => {
  it('rendert Karten mit Titel, Next-Action und Überfällig-Marker', () => {
    render(<MeineArbeitBoard items={[item()]} />)
    expect(screen.getByText('Müller')).toBeTruthy()
    expect(screen.getByText(/Gutachten anfordern/)).toBeTruthy() // ctaLabel from meta
    expect(screen.getByText(/überfällig/i)).toBeTruthy()
  })
  it('gruppiert nach Hauptphase (Spalten)', () => {
    render(<MeineArbeitBoard items={[item(), item({ id: 'c2', fallId: 'f2', stage: 'regulierung', subState: 'versicherungskontakt' })]} />)
    expect(screen.getByText('Begutachtung')).toBeTruthy()
    expect(screen.getByText('Regulierung')).toBeTruthy()
  })
  it('leerer Zustand', () => {
    render(<MeineArbeitBoard items={[]} />)
    expect(screen.getByText(/Keine aktiven Fälle/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/components/mitarbeiter/MeineArbeitBoard.test.tsx`).

- [ ] **Step 3: Implement the board**

Model the markup on `src/app/kanzlei/kanban/KanbanBoardClient.tsx` (read it first). Requirements:
- `'use client'`. Columns = the three active `ClaimMainPhase`s `['erfassung','begutachtung','regulierung']` (abschluss excluded — foundation already filters). Column header title = `MAIN_PHASE_LABEL[phase]` + count.
- For each item in a column (filter `items.filter(i => i.stage === phase)`), render a card: `<Link href={i.fallId ? '/faelle/'+i.fallId : '#'}>` containing: `display.title` (font-semibold navy), `display.kennzeichen` (mono, ondo), `<FallPhaseBadge subPhase={i.subState} size="sm" />`, the next-action `CLAIM_WORKFLOW_META[i.subState].ctaLabel` as a small pill, and if `i.isOverdue` an amber "⏱ N Tage überfällig" marker (`overdueSinceDays`). Sort each column's items overdue-first.
- Empty board (no items at all) → centered "Keine aktiven Fälle".
- Use Claimondo tokens only (`text-claimondo-navy`, `bg-claimondo-bg`, `border-claimondo-border`, `rounded-ios-*`, `text-warning-strong`/`bg-warning-soft` for overdue). No raw hex, no new color map.

- [ ] **Step 4: Run → PASS**; then `npm run check:status-registry` + `npm run check:component-set` → 0 new.

- [ ] **Step 5: Commit**

```bash
git add src/components/mitarbeiter/MeineArbeitBoard.tsx src/components/mitarbeiter/MeineArbeitBoard.test.tsx
git commit -m "feat(kb): MeineArbeitBoard - work-state phase board (next-action + overdue)"
```

---

### Task 3: Wire the board into `/mitarbeiter`

**Files:**
- Modify: `src/app/mitarbeiter/page.tsx`

**Interfaces:**
- Consumes: `getMyClaimWorkItems` (`@/lib/ops/get-claim-workitems`), `MeineArbeitBoard`.

- [ ] **Step 1: Load work-items in the server component**

After the existing `user` guard, add:
```ts
import { getMyClaimWorkItems } from '@/lib/ops/get-claim-workitems'
import MeineArbeitBoard from '@/components/mitarbeiter/MeineArbeitBoard'
// ...
const workItemsRes = await getMyClaimWorkItems(supabase, { kundenbetreuerId: user.id })
const workItems = workItemsRes.ok ? workItemsRes.items : []
```
Keep the existing `faelleCount` query (StatBar still uses it) — you may drop the `faelle` row list (lines ~52-58 `.select('fall_id, claim_nummer, sub_phase, kennzeichen, …').limit(8)`) since the board replaces it; keep the `count`. Simplest: keep the count query but change it to `head: true` (no rows): `.select('fall_id', { count: 'exact', head: true })`.

- [ ] **Step 2: Replace the "Meine Fälle" Panel body with the board**

Replace the `<Panel title="Meine Fälle" …>…</Panel>` block (the one iterating `faelle`) with:
```tsx
<Panel title="Meine Fälle" count={faelleCount ?? 0} actionLabel="Alle anzeigen →" actionHref="/mitarbeiter/faelle">
  <div className="p-3">
    <MeineArbeitBoard items={workItems} />
  </div>
</Panel>
```
(The board self-handles its empty state.) Leave the "Anstehend", StatBar, greeting, and Tasks panels untouched.

- [ ] **Step 3: Build check**

Run: `npx tsc --noEmit` (this is a route change → per AGENTS.md prefer a full build, but the shared node_modules may block local `next build`; if it fails on unrelated missing deps, rely on CI — confirm no NEW type error in `page.tsx`). Confirm `mitarbeiter/page.tsx` has no unused imports left from the removed list.

- [ ] **Step 4: Commit**

```bash
git add src/app/mitarbeiter/page.tsx
git commit -m "feat(kb): wire MeineArbeitBoard into /mitarbeiter dashboard (replaces flat Fälle list)"
```

---

## Self-Review

**Spec coverage:** KB cockpit board driven by the foundation (§6 KB-Cockpit, the board part) → Tasks 2+3; foundation deep-link gap → Task 1. **Deferred (out of scope, Phase 1b):** the Hover-Split popover + inline field editing (needs the write layer), the full "Heute"-strip rework (the existing greeting+StatBar already serves it), stream integration beyond what already exists.

**Placeholder scan:** none — Task 2's board markup is specified as concrete requirements + a named reference file (`KanbanBoardClient.tsx`) rather than pasted pixel code, because it must match that existing pattern; the tests pin the observable behavior (title, ctaLabel, overdue, columns, empty).

**Type consistency:** `ClaimWorkItem.fallId` (Task 1) is consumed by the board's `href` (Task 2); `getMyClaimWorkItems` result shape (Phase 0) consumed in Task 3 with the `.ok` guard.

**Risk note:** `/faelle/[fall_id]` is fall_id-keyed (confirmed) → the board must link by `fallId`, not `id` (claim_id). Task 1 supplies `fallId`; Task 2 uses it.
