# Claim-Detail Phase C — `getClaimDetail` Spine-Loader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One typed, role-scoped loader `getClaimDetail(supabase, claimId, rolle)` that composes the six *existing* claim loaders into a single `ClaimDetail` bundle, so the three role presentations (Phase D) consume one shared data layer instead of each re-orchestrating a giant per-page assembly (kills the ~40% query duplication between `faelle/[id]` and `kunde/faelle/[id]`).

**Architecture:** Pure composition. C adds **no new DB reads** — every field comes from a loader that already exists and is live in production. C is: a `ClaimDetail` type (a struct of existing return types) + a `getClaimDetail` function (gate → post-gate loads → role-scoped assembly) + an opt-in integration test. The access boundary is `getClaimForRole` (RLS-backed, returns `null` on no-access); post-gate sub-entity loads use `createAdminClient()` for an accurate, A1-canonical phase derivation, with role-gated *exposure*.

**Tech Stack:** TypeScript, `@supabase/supabase-js`, Next.js server components (RSC loaders), vitest (opt-in integration tests, `env=node`).

## Global Constraints

- **Worktree/branch:** all work happens in the worktree `.claude/worktrees/status-badge-registry` on branch **`kitta/claim-detail-ops-rebuild`**. The main checkout (`claimondo-v2`) is on `kitta/aar-956-…` (a 10-session collision zone) — **never build here from the main checkout.** Verify with `git -C <worktree> branch --show-current` → must print `kitta/claim-detail-ops-rebuild`.
- **Contested core is RESOLVED + guarded (do not reopen):** A1 parity (`getClaimLifecycle ≡ v_claim_phase`, 33/33) + B invariant (`operative-terminal ⇒ status-terminal`, 32/0) are committed tests. C is purely additive/read-only — keep both green; do not touch `v_claim_*` / `claims`-status columns.
- **GRANT reality:** `v_claim_base` is NOT `authenticated`-SELECT. SV reads `claims` via `claims_sv_own_select` (mig 20260708081102). `v_claim_full` IS `authenticated`-SELECT — `getClaimForRole` (reads `v_claim_full`) is therefore the correct role-scoped gate for all five roles.
- **No new DDL.** C reads only. If a consumer later needs a column, coordinate per AGENTS.md Regel 2 (apply_migration).
- **Loader null-contract:** `getClaimDetail` returns `ClaimDetail | null` (null = notFound/no-access → page calls `notFound()`), mirroring `getClaimForRole`. It is a loader lib, NOT a `'use server'` action — do NOT wrap in `{ ok, error }`, do NOT export non-async consts from a server file (it isn't one).
- **Opt-in test pattern (copy from A1/B):** `RUN_PARITY=1` + `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `describe.skipIf(!RUN)`; use `process.stdout.write` for the visible summary (vitest intercepts `console.log`); `expect(checked).toBeGreaterThan(0)` to guard vacuous passes. Sample a real `claim_id` from `v_claim_phase` (kept: `faelle` table is dropped — key on `claims.id` directly).
- **Ratchets:** after `git add`, run `npm run check:component-set -- --ratchet`, `check:knip -- --ratchet`, `check:token-audit`, `check:status-registry -- --ratchet` → 0 new. (C is a lib file, so only knip is likely relevant — a new unused file trips knip until Task 2 consumes it; see Task 2.)

---

## File Structure

- `src/lib/claims/detail/types.ts` — `ClaimDetail` type (struct of existing return types). One responsibility: the shared contract between loader and the 3 presentations.
- `src/lib/claims/detail/get-claim-detail.ts` — `getClaimDetail(supabase, claimId, rolle)`. One responsibility: gate + compose + role-scope.
- `src/lib/claims/detail/__tests__/get-claim-detail.test.ts` — opt-in integration test (shape + role-scoping + null-on-no-access).

Rationale for a new `detail/` subdir: keeps the spine namespaced and discoverable; avoids growing the already-crowded `src/lib/claims/` root.

---

### Task 1: `ClaimDetail` type + core loader (claim + lifecycle-bundle + dokumente)

The three pieces with **no assembly ambiguity** — build them first.

**Files:**
- Create: `src/lib/claims/detail/types.ts`
- Create: `src/lib/claims/detail/get-claim-detail.ts`
- Test: `src/lib/claims/detail/__tests__/get-claim-detail.test.ts`

**Interfaces:**
- Consumes:
  - `getClaimForRole(supabase: DbClient, claimId: string, rolle: Rolle): Promise<ClaimFull | null>` — `@/lib/claims/get-claim-for-role`
  - `getClaimLifecycleForClaim(admin: SupabaseClient, fallId: string): Promise<ClaimLifecycleBundle>` where `ClaimLifecycleBundle = { lifecycle: ClaimLifecycle; auftraege: AuftragRow[]; kanzleiFall: KanzleiFallRow | null }` — `@/lib/claims/get-claim-lifecycle-for-claim`
  - `getPflichtdokumenteForFall(supabase, fallId, rolle): Promise<PflichtSlotForView[]>` — `@/lib/claims/pflicht-for-fall` (already composes `getClaimForRole` internally → role-safe)
  - `createAdminClient()` — `@/lib/supabase/admin`
  - Types: `ClaimFull`, `Rolle` (`@/lib/claims/types`), `ClaimLifecycle` (`@/lib/claims/lifecycle`), `AuftragRow` (`@/lib/auftrag/queries`), `KanzleiFallRow` (`@/lib/kanzlei-fall/queries`), `PflichtSlotForView` (`@/lib/claims/pflicht-for-fall`)
- Produces (Task 2/3 + Phase D rely on these exact names):
  - `type ClaimDetail` (fields added incrementally; Task 1 lands `rolle`, `claim`, `lifecycle`, `auftraege`, `kanzleiFall`, `pflichtDokumente`)
  - `async function getClaimDetail(supabase: DbClient, claimId: string, rolle: Rolle): Promise<ClaimDetail | null>`

- [ ] **Step 1: Write `ClaimDetail` (Task-1 subset) in `types.ts`**

```typescript
// src/lib/claims/detail/types.ts
// Phase C: der geteilte Claim-Detail-Vertrag. EINE Datenschicht fuer alle drei
// Rollen-Praesentationen (Phase D). Reine Komposition existierender Loader-
// Rueckgabetypen — kein neuer DB-Read. Access-Gate = getClaimForRole (RLS).
import type { ClaimFull, Rolle } from '@/lib/claims/types'
import type { ClaimLifecycle } from '@/lib/claims/lifecycle'
import type { AuftragRow } from '@/lib/auftrag/queries'
import type { KanzleiFallRow } from '@/lib/kanzlei-fall/queries'
import type { PflichtSlotForView } from '@/lib/claims/pflicht-for-fall'

export type ClaimDetail = {
  /** Die anfragende Rolle — Renderer scopen ihre Sicht daran. */
  rolle: Rolle
  /** Claim-Kern + Sub-Entities (parties/vehicle/payments/…), rollen-spalten-gescoped via COLUMN_PROFILES. */
  claim: ClaimFull
  /** A1-kanonische Phase (mainPhase/subPhase/serviceTyp/aktiverAuftrag/aktiveSideQuests). */
  lifecycle: ClaimLifecycle
  /** SV-Auftraege. NUR kb/admin (sonst []) — kein Column-Profile auf auftraege, no-leak-Default. */
  auftraege: AuftragRow[]
  /** Regulierungs-Entity. NUR kb/admin/kanzlei (sonst null). */
  kanzleiFall: KanzleiFallRow | null
  /** Pflicht-Dokumente-Slots, rollen-gescoped (getPflichtdokumenteForFall gated intern). */
  pflichtDokumente: PflichtSlotForView[]
}
```

- [ ] **Step 2: Write the failing test** (`get-claim-detail.test.ts`) — samples one `claim_id` from `v_claim_phase`, calls `getClaimDetail(admin, id, 'admin')`, asserts `detail !== null`, `detail.claim.id === id`, `Array.isArray(detail.auftraege)`, `detail.pflichtDokumente` is an array; then calls with a random UUID and asserts `null`. Opt-in (`RUN_PARITY` + service env), `process.stdout.write` summary, `expect(checked).toBeGreaterThan(0)`.

- [ ] **Step 3: Run it, verify it fails** (`getClaimDetail is not a function`): `RUN_PARITY=1 <env> npx vitest run src/lib/claims/detail/__tests__/get-claim-detail.test.ts`

- [ ] **Step 4: Implement `getClaimDetail` (Task-1 subset) in `get-claim-detail.ts`**

```typescript
// src/lib/claims/detail/get-claim-detail.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { Rolle } from '@/lib/claims/types'
import { getClaimForRole } from '@/lib/claims/get-claim-for-role'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'
import { getPflichtdokumenteForFall } from '@/lib/claims/pflicht-for-fall'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimDetail } from './types'

type DbClient = SupabaseClient<Database>

export async function getClaimDetail(
  supabase: DbClient,
  claimId: string,
  rolle: Rolle,
): Promise<ClaimDetail | null> {
  // 1) GATE (RLS-backed): kein Zugriff / nicht gefunden -> null.
  const claim = await getClaimForRole(supabase, claimId, rolle)
  if (!claim) return null

  // 2) Post-Gate: Lifecycle via Admin — getClaimLifecycle braucht ALLE Sub-Entities
  //    fuer die A1-kanonische Phase (RLS-partielle Reads -> falsche Phase fuer sv/kunde).
  //    Gate oben hat Zugriff bereits geprueft; die Phase ist nicht sensibler als der Claim.
  const admin = createAdminClient()
  const { lifecycle, auftraege, kanzleiFall } = await getClaimLifecycleForClaim(admin, claimId)

  // 3) Dokumente: eigener rollen-gescopeter Loader (gated intern via getClaimForRole).
  const pflichtDokumente = await getPflichtdokumenteForFall(supabase, claimId, rolle)

  // 4) Rollen-gescopte Exposure der admin-geladenen Sub-Entities (no-leak-Default):
  const istStaff = rolle === 'kb' || rolle === 'admin'
  return {
    rolle,
    claim,
    lifecycle,
    auftraege: istStaff ? auftraege : [],
    kanzleiFall: istStaff || rolle === 'kanzlei' ? kanzleiFall : null,
    pflichtDokumente,
  }
}
```

- [ ] **Step 5: Run the test, verify it passes.** Record `checked=N` in the report.
- [ ] **Step 6: `git add` the three files; run `npm run check:knip -- --ratchet`.** Expect: knip flags `get-claim-detail.ts`/`types.ts` as unused (no consumer yet). **Do NOT bump the baseline** — Task 2 makes it consumed. If landing Task 1 as its own commit, note the transient knip-warn in the commit body; the reviewer accepts it because Task 2 resolves it in the same branch.
- [ ] **Step 7: Commit** with the 7-point audit block.

---

### Task 2: Add `timeline`, then prove the shape on the first real consumer (Kunde page)

This is where C stops being speculative: the **first renderer locks the assembly decisions**, and C becomes consumed (knip green).

**Files:**
- Modify: `src/lib/claims/detail/types.ts` (+ `timeline`), `src/lib/claims/detail/get-claim-detail.ts` (+ timeline load)
- Modify: `src/app/kunde/faelle/[id]/page.tsx` (refactor its claim/lifecycle/timeline/dokumente assembly to a single `getClaimDetail(supabase, id, 'kunde')` call — the smaller, lower-risk of the two consumers; do NOT touch the 1130-line admin monolith yet)
- Test: extend `get-claim-detail.test.ts`

**Assembly decision to LOCK here (D-driven — decide with the Kunde renderer, do not guess earlier):**
- **Timeline source:** default `getFallEventStream(supabase, claimId)` (user-client, RLS-scoped → role-safe; wrap in `.catch(() => [])` per the AAR-650 defensive pattern in `faelle/[id]/page.tsx:274`). The admin monolith *also* uses `getClaimTimeline(claimId, role)` for a *projected* timeline — if the Kunde page needs that projection instead/as-well, add it here as a second field (`timelineProjected`) rather than overloading `timeline`. Whichever the renderer actually shows wins.

- [ ] **Step 1:** Read `src/app/kunde/faelle/[id]/page.tsx` fully; list every claim/lifecycle/timeline/dokumente read it does today (that is the duplication C removes).
- [ ] **Step 2:** Add `timeline: FallEvent[]` to `ClaimDetail` (`import type { FallEvent } from '@/lib/fall/event-stream'`).
- [ ] **Step 3:** In `getClaimDetail`, load `const timeline = await getFallEventStream(supabase, claimId).catch(() => [])` after the gate; add to the returned object.
- [ ] **Step 4 (TDD):** extend the test — assert `Array.isArray(detail.timeline)`.
- [ ] **Step 5:** Refactor `kunde/faelle/[id]/page.tsx` to call `getClaimDetail(supabase, id, 'kunde')` and feed its fields to the existing child components (delete the now-dead inline reads it replaces). Keep any kunde-only extras that C doesn't cover as-is.
- [ ] **Step 6: FULL build** (`npm run build` — this is a route change; Next 15 validates RSC at build time, tsc alone is insufficient per AGENTS.md Audit-Punkt 1).
- [ ] **Step 7:** `git add`; run all four ratchets → knip now green (file consumed). Commit.
- [ ] **Step 8: Prod smoke** (fresh SW-free browser, real test account — Kunde): open a Kunde claim detail, confirm it renders identically (parties, phase, timeline, dokumente). This is the regression gate for the refactor.

---

### Task 3: Add `workItem` + `permissions` (ops axis — for the Phase-D staff views)

Only meaningful once a **staff** presentation (D-admin/kb) needs them; build with that consumer, not before.

**Assembly decisions to LOCK with the staff renderer:**
- **workItem:** reuse `@/lib/ops` — the LIVE Phase-2 `v_claim_workstate → ClaimWorkItem` (`src/lib/ops/get-claim-workitems.ts` reads it in user-context/RLS; `src/lib/ops/derive-claim-workflow-state.ts` is the pure row→item; type in `src/lib/ops/claim-workstate.types.ts`). Need the **single-claim** row (`.eq('claim_id', claimId)`), not the Kanban list. Populate for `kb`/`admin` only (`null` otherwise — Kunde/SV have no ops axis).
- **permissions:** minimal descriptor `{ rolle, status: claim.status }`; the renderer calls the existing `canEditField(rolle, field, status)` from `@/lib/permissions` per field (do NOT precompute a field→bool map C's consumers don't need — YAGNI).

- [ ] Add `workItem: ClaimWorkItem | null` + `permissions: { rolle: Rolle; status: string | null }` to `ClaimDetail`.
- [ ] Load workItem (kb/admin only) via the ops single-claim read; set `permissions` from `rolle` + `claim.status`.
- [ ] Extend the test: assert `workItem` present for `admin`, `null` for `kunde`.
- [ ] Build + ratchets + commit.

---

## Phase D outline (NOT yet bite-sized — plan D after C lands + shape is proven)

D migrates the three presentations onto `getClaimDetail`. Do this as **separate plans/PRs per role**, subagent-driven, each with a prod smoke — never one big-bang.

- **D-admin/kb** (the hard one): `src/app/faelle/[id]/page.tsx` is a **1130-line monolith** with ~25 data sources. C replaces only its *spine* (claim core, lifecycle, timeline, pflicht-dokumente). The ~20 staff-only side-concerns **stay** and hang off C: QC/Vollständigkeits-Card, VS-Korrespondenz, Kanzlei-Paket + QR, Gutachten-OCR, Belege-Review, Ad-hoc-Anforderungen, KB-Phase-Audit, Regulierung-Card, Werkstatt-Vermittlung-Panel, Claim-AI-Panel (⚠ owned by sessions 876a45e8/ad4c0df0 — coordinate), other-open-faelle banner. Preserve every defensive `.catch()` (AAR-650) and the admin-after-gate pattern. Add Next-Best-Action + inline-edit (canEditField) + Stepper on top of C.
- **D-sv:** the SV fall view — consumes C with `rolle='sv'` (its own auftraege via SV loaders, not the staff `auftraege` field).
- **D-kunde:** already migrated in Task 2 — extend its narrative presentation as desired.

**Reuse (do not rebuild) for D:** `WorkItemCard` / `updateClaimField` / `overrideClaimPhase` (Phase-2, LIVE), Status-Registry (`src/lib/status`, `<FallStatusBadge>`/`<FallPhaseBadge>`), `FallakteShell` + its Tab components, `canEditField` (`@/lib/permissions`), the primitives/shared component set.

---

## Architecture incorporation — Aaron audit (08.07.) + "für alle Rollen"

Aaron relayed a claims-data-architecture audit; incorporated here (durchdenken sauber + nutzungsfähig, **all roles**). Live-verified facts + the real actionable debt:

### A. Load-once-and-pass-down for ALL roles (the primary upgrade)
Today Admin/KB + SV load the claim **once** (`getFallById` → `FallProvider` / `useFall()`) and pass `claim_id`/`sv_id`/`kundenbetreuer_id` to every sub-tab — no sub-queries. **The Kunde portal has NO such context** — its server page loads inline + fires several extra queries. `getClaimDetail` IS the load-once primitive that closes this gap. → **Phase D gains a shared `ClaimDetailProvider` + `useClaimDetail()`** (generalising the FallProvider pattern) that EVERY role layout (kunde/sv/kb/admin/kanzlei) mounts, so all five roles get the same load-once-pass-down structure. **C-Task 2 (refactor `kunde/faelle/[id]` onto `getClaimDetail`) is the first, highest-value instance — it closes the Kunde gap directly.** This is the concrete meaning of "für alle Rollen".

### B. Stop the detail-page rest-field re-queries (makes the loader genuinely "nutzungsfähig")
Detail pages still re-query rest-fields directly on `claims`/`v_claim_full` — `work_state`, `schadenort_*`, `kostenvoranschlag_*` (kva), `reparatur_freigegeben_am`, `werkstatt_id` (see `faelle/[id]/page.tsx:95-118`) — because `v_claim_base` does not mirror them yet (documented temporary "CMM-Brücke"). → `getClaimDetail` should **absorb** these reads (one place) so presentations stop re-querying. Add them to `ClaimDetail` in the Task that migrates the staff view (D-admin/kb), reading via `getClaimForRole` (v_claim_full already carries several) or a thin staff-only supplemental read. Coordinate the DB side (mirror-in-base) with lane 6f60c510.

### C. View-layer facts (live-verified this session via pg_get_viewdef) + lane
Prod: `v_claim_full` **references `v_claim_base`** (`refs_v_claim_base=true`); `v_claim_base` references `v_claim_phase`. So the chain `v_claim_phase ← v_claim_base ← v_claim_full` **holds live**, and A2's phase-parity (v_claim_full ≡ v_claim_phase, 0/32) stands. **Correction:** the audit's "v_claim_full is its own definition FROM claims, not derived from base" is stale/imprecise post-ledger-central — full DOES read base today. The genuine remaining view debt = rest-field mirroring (B) + eventual `v_claim_base`/`v_claim_full` consolidation, both owned by **lane 6f60c510** (v_claim_base/ledger). My lane (getClaimDetail + presentations) **depends on** `v_claim_full` (via `getClaimForRole`) but does not change it — coordinate, don't clobber.

### D. faelle_claim_bridge = deliberate drop-runway
`faelle` table is gone; `faelle_claim_bridge` (id-mapping) stays active as a runway (no dual-write). `resolveClaimId` (used by every loader C composes) already handles both `claims.id` and the bridge lookup — C needs no change here; do NOT "fix" the bridge prematurely.

---

## Self-Review

- **All-roles coverage:** Section A makes "für alle Rollen" concrete — a shared provider so Kunde gets the same load-once structure as Admin/KB/SV. ✔
- **Spec coverage:** C = the "geteilte Datenschicht" from the approved design spec (`docs/superpowers/specs/2026-07-08-claim-detail-ops-rebuild-lifecycle-cleanup-design.md`). ✔ claim+lifecycle+auftraege+kanzleiFall+parties+fahrzeug+payments (in ClaimFull)+dokumente+timeline+workItem+permissions, role-scoped — every listed field maps to a task. Mietwagen/repairs/vs_korrespondenz already ride inside `ClaimFull` per COLUMN_PROFILES (no extra task).
- **Placeholder scan:** all signatures are copied from confirmed source (file:line verified this session). No TBD.
- **Type consistency:** `ClaimDetail` field names are stable across Tasks 1→3; loaders' return types are the source of truth (no re-declaration).
- **YAGNI/consumer-drives-shape:** Tasks 2 & 3 explicitly defer the ambiguous assembly decisions to the first real renderer — the reason C is not finalized in one shot.
