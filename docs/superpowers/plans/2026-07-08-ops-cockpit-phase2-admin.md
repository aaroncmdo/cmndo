# Ops-Cockpit Phase 2 — Admin-Cockpit (Rollup-Matrix) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Replace the generic KPI-greeting top of `/admin` with a claim-workflow **Ops-Cockpit**: an aggregate **Phase × Owner** rollup matrix (derived from `v_ops_rollup`) + workflow-KPI strip + "Braucht Aufmerksamkeit" overdue list + click-to-drill-in list — admin-wide. The finance/SV widgets (payments, revenue, säumige SVs, Tageskalender) are PRESERVED below (a different domain than claim-workflow — deleting them would regress financial oversight).

**Architecture (Approach C, Layer 2 + reuse Layer 1):**
- Layer-2 read-aggregate view `v_ops_rollup` (DONE, prod-live): `security_invoker=true` over the gated `v_claim_workstate` → admin sees all, KB sees own; cols = `main_phase`, rows = `kundenbetreuer_id`, `anzahl` + coarse `stale_anzahl` (>7d since `updated_at`).
- Layer-1 `getMyClaimWorkItems(supabase, {})` in admin context → ALL active claims' `ClaimWorkItem`s (accurate TS `isOverdue`) → feeds the attention list + drill-in.
- New client cockpit composes matrix (from `v_ops_rollup`) + work-items (attention/drill-in). Reuses `ClaimWorkItem`, status registry, `ClaimMainPhaseBadge`, `FallPhaseBadge`, `StatBar`.

**Tech Stack:** Next.js App Router (server page + client cockpit), Supabase (security_invoker view), React, Tailwind (claimondo tokens), vitest (env=node + `renderToStaticMarkup`).

## Global Constraints

- **Colors ONLY via `src/lib/status` registry** (status-registry ratchet) — `ClaimMainPhaseBadge`/`FallPhaseBadge`/`statusSlotClass`; NEVER raw `bg-green-*`. Non-status heat tint uses `bg-warning-soft`/`text-warning-strong` semantic tokens.
- **Components:** `@/components/primitives` (Card/Button) + `@/components/shared` (StatBar/DataTable). No hand-rolled `<div class="bg-white rounded border">` cards or primary-fill `<button>` (component-set ratchet).
- **UI text = real Umlauts** (ä/ö/ü/ß).
- **Design tokens:** `rounded-ios-*`, `claimondo-*`, `text-heading-*`/`text-body-*`. No bracket-hex.
- **Server-actions** (none new expected here) return `{ ok, error }`; no non-async exports from `'use server'`.
- **RLS:** never bypass the gate — read `v_ops_rollup`/`v_claim_workstate` via the user's `createClient()` (admin visibility flows from the gate, not a service client).

---

### Task 1: Surface `kundenbetreuerId` on `ClaimWorkItem`

**Files:**
- Modify: `src/lib/ops/claim-workstate.types.ts` (add field to `ClaimWorkItem`)
- Modify: `src/lib/ops/derive-claim-workflow-state.ts` (map `row.kundenbetreuer_id`)
- Test: `src/lib/ops/derive-claim-workflow-state.test.ts`

**Interfaces:**
- Produces: `ClaimWorkItem.kundenbetreuerId: string | null` — the admin matrix + drill-in filter by it.

Additive; the KB cockpit ignores it. Add `kundenbetreuerId: string | null` to the interface; in derive add `kundenbetreuerId: row.kundenbetreuer_id`. Test asserts it surfaces + is null when the row's is null.

### Task 2: `getOpsRollup` query + types

**Files:**
- Create: `src/lib/ops/ops-rollup.types.ts`
- Create: `src/lib/ops/get-ops-rollup.ts`
- Test: `src/lib/ops/get-ops-rollup.test.ts`

**Interfaces (Produces):**
```ts
export interface OpsRollupCell { phase: ClaimMainPhase; ownerId: string | null; anzahl: number; stale: number }
export interface OpsRollupOwner { id: string | null; name: string }   // id=null => "Nicht zugewiesen"
export interface OpsRollup {
  cells: OpsRollupCell[]
  owners: OpsRollupOwner[]      // sorted: named KBs A→Z, then "Nicht zugewiesen" last
  phases: ClaimMainPhase[]      // ['erfassung','begutachtung','regulierung','abschluss'] present-or-canonical
  totalAktiv: number
  totalStale: number
}
export function getOpsRollup(supabase: SupabaseClient): Promise<{ ok: true; rollup: OpsRollup } | { ok: false; error: string }>
```
Reads `v_ops_rollup` (`main_phase,kundenbetreuer_id,anzahl,stale_anzahl`). Collect distinct non-null `kundenbetreuer_id`s → one `profiles` query (`id,vorname,nachname` in-list) → name map (`"Vorname Nachname"`, fallback id-prefix). Build owners (named A→Z, null last), cells (`toClaimMainPhase`), totals. Result-object; on error `{ok:false}`.
Test (mock supabase, two `from()` targets): rollup groups cells, owners include "Nicht zugewiesen" for null KB, totals sum; DB error → `{ok:false}`.

### Task 3: `OpsWorkItemRow` — reusable compact work-item row

**Files:**
- Create: `src/components/admin/OpsWorkItemRow.tsx`
- Test: `src/components/admin/OpsWorkItemRow.test.tsx`

**Interfaces (Produces):** `export default function OpsWorkItemRow({ item, ownerName }: { item: ClaimWorkItem; ownerName?: string })`
Compact clickable row used by BOTH the attention list and the drill-in: `next/link` → `/faelle/${item.fallId}` (plain `<div>` when `fallId` null), shows `display.title`, `kennzeichen`, `<FallPhaseBadge subPhase={item.subState} />`, next-action label (`CLAIM_WORKFLOW_META[subState].ctaLabel`), owner name, and — when `isOverdue` — "N Tage überfällig" in `text-danger-strong`. Card via `@/components/primitives` `Card`. Test: renders title + `/faelle/f1` href + overdue text; no href when fallId null.

### Task 4: `OpsRollupMatrix` — Phase × Owner heatmap

**Files:**
- Create: `src/components/admin/OpsRollupMatrix.tsx`
- Test: `src/components/admin/OpsRollupMatrix.test.tsx`

**Interfaces (Produces):**
```ts
export default function OpsRollupMatrix({ rollup, selected, onSelect }: {
  rollup: OpsRollup
  selected: { phase: ClaimMainPhase; ownerId: string | null } | null
  onSelect: (sel: { phase: ClaimMainPhase; ownerId: string | null } | null) => void
})
```
CSS-grid table: header row = owner-col label + one `<ClaimMainPhaseBadge phase>` per phase + "Σ". Each owner row: name + one cell/phase (`<button>` from `primitives` OR a token-styled clickable `Card`; count bold, `stale>0` → `bg-warning-soft text-warning-strong` + "N alt"; count 0 → muted `—`) + row total. Footer row = column totals. Selected cell = ring highlight; clicking toggles select/deselect via `onSelect`. Empty rollup → `EmptyState` "Keine aktiven Fälle". Test (renderToStaticMarkup, mock badges): phase labels present, owner names present, counts present, empty state.

### Task 5: `AdminOpsCockpit` — compose the cockpit

**Files:**
- Create: `src/components/admin/AdminOpsCockpit.tsx` (`'use client'`)
- Test: `src/components/admin/AdminOpsCockpit.test.tsx`

**Interfaces (Consumes):** `OpsRollup`, `ClaimWorkItem[]`, owner-name map (derive from `rollup.owners`).
```ts
export default function AdminOpsCockpit({ rollup, items }: { rollup: OpsRollup; items: ClaimWorkItem[] })
```
- Workflow-KPI strip (shared `StatBar` or a token strip): `Aktiv` (items.length), `Überfällig` (items.filter(isOverdue).length, tone danger if >0), `Nicht zugewiesen` (items.filter(i=>!i.kundenbetreuerId).length, warning if >0).
- `OpsRollupMatrix` with local `useState` selected.
- Drill-in: when `selected`, list `items.filter(i => i.stage===selected.phase && i.kundenbetreuerId===selected.ownerId)` as `OpsWorkItemRow` (heading "Begutachtung · <Owner>"). When no selection, hide.
- "Braucht Aufmerksamkeit": `items.filter(isOverdue).sort((a,b)=>(b.overdueSinceDays??0)-(a.overdueSinceDays??0)).slice(0,8)` as `OpsWorkItemRow` with owner name; empty → "Nichts Überfälliges 🎉".
Owner-name lookup: `Map(rollup.owners.map(o=>[o.id,o.name]))`. Test (renderToStaticMarkup, mock child components/link): KPI counts render, attention shows an overdue item, empty-overdue shows the celebratory text.

### Task 6: Wire `/admin/page.tsx` — cockpit becomes primary surface

**Files:**
- Modify: `src/app/admin/page.tsx`

Keep the Greeting + Dringlichkeits-Zeile. Load in the top `Promise.all`: `getOpsRollup(supabase)` + `getMyClaimWorkItems(supabase, {})`. Render `<AdminOpsCockpit rollup items />` as the NEW primary block (directly under the greeting). DEMOTE the existing finance StatBar + finance/content widgets (KritischeUpdates/Tageskalender/Zahlungen/WichtigeUpdates/DashboardStats) BELOW the cockpit under a small "Finanzen & Betrieb"-Heading — preserved, not deleted (reversible; flag to Aaron). Guard both loads: on `{ok:false}` render the cockpit-less fallback (existing layout) so the page never crashes. Full `npm run build` (route change).

---

## Global verification (before commit/PR)
- `npx tsc --noEmit` green.
- `npm run check:token-audit && npm run check:component-set -- --ratchet && npm run check:status-registry -- --ratchet && npm run check:knip -- --ratchet` — 0 new.
- `npx vitest run` for the new/changed test files — green.
- 7-point audit in commit body; branch `kitta/ops-cockpit-phase2-admin`; PR vs `staging`.

## Self-review notes
- `v_ops_rollup` already prod-live (migs `20260707233346` + `20260707233820`), files committed this branch.
- Matrix source = the derived view (Aaron's "eine abgeleitete View die die Cockpits zeigt"); attention/drill-in = work-items (accurate TS overdue). One gate, two lenses.
- Finance preserved-below is the one judgment call — surface to Aaron.
