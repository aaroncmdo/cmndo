# Sub-Projekt A — Lifecycle-SSoT-Härtung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Make the claim-phase derivation ONE canonical SSoT — prove `getClaimLifecycle` (TS) ≡ `v_claim_phase` (SQL) with a parity test, then make `v_claim_full`/`v_claim_base` **read** `v_claim_phase` instead of inline-deriving, so `phase_override` is canonical everywhere.

**Architecture:** REUSE-only, no rebuild. A1 reuses `getClaimLifecycleForClaim` + `v_claim_phase` (existing) to assert parity. A2 is surgical DDL: swap the inline `main_phase`/`sub_phase` CASE in `v_claim_full`/`v_claim_base` for a `LEFT JOIN public.v_claim_phase` — every other column, the gate, and grants preserved.

**Tech Stack:** vitest (integration, service client), Supabase MCP `apply_migration` (DDL), Node/pg.

## Global Constraints
- **REUSE, don't rebuild** (Aaron): consume `getClaimLifecycle`/`getClaimLifecycleForClaim`/`v_claim_phase` — never re-derive the phase.
- DDL ONLY via `apply_migration`; commit the file named by the tracked version (Regel 2); `execute_sql` READ-only.
- **Parity-gate first:** A1 MUST pass before A2 touches any view. If A1 reveals drift, fix the drift (align TS↔SQL) before A2.
- After A2: `audit_ungated_definer_views()` = 0 AND `audit_claim_views_leaking_to_nobody()` = 0; the gate on `v_claim_full` preserved; `v_claim_full` verified reading `v_claim_phase` (`pg_get_viewdef ~ 'v_claim_phase'`).
- **Contested core:** `v_claim_full`/`v_claim_phase` shared with sessions 6f60c510/6c630247/876a45e8 → coordinate (marker), additive-verify, behavior-neutral per parity.

---

### Task A1: Parity test `getClaimLifecycle` ↔ `v_claim_phase`

**Files:** Create `src/lib/claims/__tests__/claim-phase-parity.test.ts`.

**Interfaces:**
- Consumes: `getClaimLifecycleForClaim(admin, fallId)` → `{ lifecycle: { mainPhase, subPhase } , ... }` (existing, REUSED); `v_claim_phase(claim_id → main_phase, sub_phase)`; `faelle.claim_id` bridge.
- Produces: a PR-gate proving the ONE derivation.

- [ ] **Step 1: Write the test** (opt-in; needs service env — skips cleanly without it)

```ts
// src/lib/claims/__tests__/claim-phase-parity.test.ts
// Integration: proves getClaimLifecycle (TS SSoT) === v_claim_phase (SQL SSoT) on live claims.
// Opt-in (RUN_PARITY=1 + service env). NUR lesend. Reused getClaimLifecycleForClaim (kein Rebuild).
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getClaimLifecycleForClaim } from '@/lib/claims/get-claim-lifecycle-for-claim'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const RUN = !!process.env.RUN_PARITY && !!URL && !!SERVICE

describe.skipIf(!RUN)('claim-phase parity (getClaimLifecycle ↔ v_claim_phase)', () => {
  it('stimmt auf einem Live-Sample bit-gleich überein', async () => {
    const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
    // Sample claims that HAVE a fall (the loader is fall-keyed) across all phases.
    const { data: rows, error } = await admin
      .from('v_claim_phase')
      .select('claim_id, main_phase, sub_phase')
      .limit(200)
    expect(error).toBeNull()
    const mismatches: { claim_id: string; sql: string; ts: string }[] = []
    for (const r of rows ?? []) {
      const { data: fall } = await admin.from('faelle').select('id').eq('claim_id', r.claim_id as string).maybeSingle()
      if (!fall?.id) continue // no fall row -> loader n/a; view still covers it (list-only)
      const { lifecycle } = await getClaimLifecycleForClaim(admin, fall.id as string)
      const sql = `${r.main_phase}/${r.sub_phase}`
      const ts = `${lifecycle.mainPhase}/${lifecycle.subPhase}`
      if (sql !== ts) mismatches.push({ claim_id: r.claim_id as string, sql, ts })
    }
    if (mismatches.length) console.error('PARITY MISMATCHES:', JSON.stringify(mismatches, null, 2))
    expect(mismatches, `${mismatches.length} Claims driften zwischen TS und SQL`).toHaveLength(0)
  }, 120_000)
})
```

- [ ] **Step 2: Run it** — `RUN_PARITY=1 NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx vitest run src/lib/claims/__tests__/claim-phase-parity.test.ts`
  Expected: PASS (parity holds) — OR a mismatch list revealing pre-existing drift.
- [ ] **Step 3: If mismatches** — analyze each (is the TS or the SQL wrong?), align them (fix `lifecycle.ts` OR the `v_claim_phase` migration surgically), re-run until 0. Document each drift fix in the commit.
- [ ] **Step 4: Wire as a build check** — add an npm script `check:claim-parity` (opt-in in CI where the service env exists), OR document it as a required manual gate before A2. Commit.

### Task A2: `v_claim_full` + `v_claim_base` read `v_claim_phase`

**Files:** `apply_migration` → commit `supabase/migrations/<tracked>_vclaimfull_reads_vclaimphase.sql`.

**Interfaces:** Consumes A1 (parity proven). Produces: `phase_override` canonical in `v_claim_full`/`v_claim_base` (+ every downstream: `v_faelle`, `faelle_kunde`, …).

- [ ] **Step 1: Fetch current defs** — `execute_sql: select pg_get_viewdef('public.v_claim_base'::regclass, true), pg_get_viewdef('public.v_claim_full'::regclass, true);` Identify the inline `CASE … END AS main_phase` (+ sub_phase) block and the claim-id column used for joining.
- [ ] **Step 2: Rewrite `v_claim_base` (the root)** — `CREATE OR REPLACE VIEW public.v_claim_base … AS` with the inline main_phase/sub_phase CASE **replaced** by `LEFT JOIN public.v_claim_phase vcp ON vcp.claim_id = <claim_id_col>` and `vcp.main_phase AS main_phase, vcp.sub_phase AS sub_phase`. **Preserve every other column, order, `WITH (security_invoker/…)`, the gate `WHERE claim_sichtbar_fuer_aktuellen_user(…)`, and re-issue the exact grants.** (v_claim_full inherits from v_claim_base — confirm whether v_claim_full needs its own change or inherits.)
- [ ] **Step 3: Apply via `apply_migration({name:'vclaimfull_reads_vclaimphase', query})`**, then `list_migrations` → commit the file named by the tracked version.
- [ ] **Step 4: Verify (READ)** —
  `select (pg_get_viewdef('public.v_claim_full'::regclass) ~ 'v_claim_phase') as reads, (select count(*) from audit_ungated_definer_views()) as a, (select count(*) from audit_claim_views_leaking_to_nobody()) as b;` → reads=true, a=0, b=0.
- [ ] **Step 5: Re-run the A1 parity test** → still 0 mismatches (behavior-neutral where no override).
- [ ] **Step 6: Prove `phase_override` now propagates** — pick a claim with `phase_override` set (or set one on a TEST claim), assert `v_claim_full.main_phase` = the override. Revert the test override.
- [ ] **Step 7: Commit + PR vs staging** with the coordination note (contested core; parity-gated; behavior-neutral).

---

## Self-review
- Spec coverage: A1 (parity test) + A2 (v_claim_full/base dedup) = the full "A · SSoT-Härtung" from the spec. ✓
- REUSE: A1 reuses `getClaimLifecycleForClaim` (no re-derivation); A2 reuses `v_claim_phase`. Builds nothing new. ✓ (Aaron's steer.)
- Risk gate: A1 must pass before A2; A2 behavior-neutral per parity; audit=0. ✓
