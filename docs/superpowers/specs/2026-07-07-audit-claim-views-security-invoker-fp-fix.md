# Spec: `audit_claim_views_leaking_to_nobody()` false-positives on `security_invoker` views

**Status:** Open ticket for the rls-härtung infra owner (design lineage: `docs/superpowers/specs/2026-06-27-rls-haertung-claim-views-design.md`). Not urgent — the interim per-view-gate workaround holds — but it recurs with every new `security_invoker` claim-view.

**Owner:** whoever owns `scripts/check-claim-view-rls.mjs` + the `audit_*` RPCs (migration `20260627201851_rls_haertung_audit_claim_view_gates_rpc.sql`).

## Problem

The required `build` step `Claim-View-RLS` runs `audit_claim_views_leaking_to_nobody()`, which empirically checks whether a "nobody" user can read any public view that exposes a `claim_id` and is granted to `anon`/`authenticated`. It:

1. is `SECURITY DEFINER`, owned by `postgres` (which has `rolbypassrls = true`),
2. sets `request.jwt.claims` to a non-existent authenticated uid ("nobody"),
3. runs `SELECT count(*) FROM <view>` and flags any view returning `> 0`.

For the 7 original claim-views this is correct — they are `SECURITY DEFINER` and **self-gate** internally via `claim_sichtbar_fuer_aktuellen_user(claim_id)` using `auth.uid()` (= the nobody), so they return 0.

**But for `security_invoker` views it is a false positive.** A `security_invoker` view runs with the *caller's* privileges — and the caller here is the `SECURITY DEFINER` RPC running as `postgres` with `bypassrls = true`. So the underlying table's RLS is **bypassed**, the count sees all rows regardless of the nobody JWT, and the view is falsely reported as leaking.

### Concrete incident (2026-07-07)
`v_claim_payments` (a payment-ledger pivot, `security_invoker = true` over `claim_payments`) false-positived and **blocked every session's `build`** (the check reads live prod state, so it reds out every SQL-touching PR — `v_werkstatt_lead` pattern). `claim_payments` RLS is actually correct (`admin OR (kundenbetreuer AND owns claim)`), so the view was never really leaking. Worked around by adding an explicit `WHERE claim_sichtbar_fuer_aktuellen_user(claim_id)` gate to the view (`20260707142841_v_claim_payments_rowgate_hotfix`).

**This will recur.** The payment-ledger normalisation is deliberately building more `security_invoker` pivot views (`v_claim_*`), and each new one false-positives until gated.

## Why the obvious fix does NOT work

The intuitive fix — have the RPC drop to a non-privileged role before the count (`SET LOCAL ROLE authenticated`) so RLS is enforced — is **impossible**. Postgres rejects it at call time:

```
42501: cannot set parameter "role" within security-definer function
```

`SET ROLE` / `SET role` is forbidden inside *any* `SECURITY DEFINER` function, and this RPC must be `SECURITY DEFINER` (it needs catalog privileges to enumerate `pg_class` + `role_table_grants`). Attempted + reverted cleanly on 2026-07-07 (function restored to original, experiment migration entries removed → prod pristine). **Lesson: RLS-enforcement tests cannot happen inside a `SECURITY DEFINER` context — they must run either at the check-script layer with a real role-JWT, or as pure static catalog analysis.**

## Approaches

### C1 — Move the empirical test to the check script (real nobody-JWT)
`check-claim-view-rls.mjs` mints a JWT for a non-existent `authenticated` user (signed with the project's Supabase JWT secret) and queries each candidate view via PostgREST/supabase-js as that user. PostgREST does `SET ROLE authenticated` per request **outside any DEFINER context** → RLS is enforced → correct for both `SECURITY DEFINER` (self-gate) and `security_invoker` (RLS) views.

- Keep a slim `SECURITY DEFINER` RPC that only *enumerates* the candidate view names (needs catalog privileges); the script does the counts as the nobody.
- **Trade-off:** needs `SUPABASE_JWT_SECRET` in CI (today only `SUPABASE_SERVICE_ROLE_KEY` is present — verify availability). More moving parts, but the *most correct* test.

### C2 — Static catalog analysis for `security_invoker` views (recommended, self-contained)
Split the RPC by view kind:
- **`SECURITY DEFINER` views:** keep the current count-based empirical test (valid — they run as owner regardless of caller).
- **`security_invoker` views:** do **not** count (invalid under `bypassrls`). Instead statically verify that every base relation the view reads has `relrowsecurity = true` and at least one policy. Flag the view only if some base table is un-gated.

Resolve base relations via `pg_rewrite` / `pg_depend` (recurse through nested views to the underlying tables). Pure catalog analysis — no role switch, no CI secret.

- **Trade-off:** "has RLS + a policy" is weaker than an empirical count (a *permissive* policy could still leak); base-table resolution through nested views is fiddly. But it is self-contained and catches the real failure mode (an invoker view over a non-RLS table).

### Recommendation
**C2** as the pragmatic, dependency-free fix, keeping the per-view-gate convention (below) as belt-and-suspenders. Adopt **C1** later if the JWT secret is wired into CI and a stronger empirical guarantee is wanted.

## Interim workaround (current accepted pattern — document in the rls-härtung design)
Every new `security_invoker` claim-view gets an explicit `WHERE claim_sichtbar_fuer_aktuellen_user(claim_id)`. One line; harmless defense-in-depth; it satisfies the current audit because the explicit `WHERE` (unlike table RLS) is evaluated even under `bypassrls` and filters on `auth.uid()` = nobody → 0 rows. Builders of new pivot views should add it by default.

## Test plan (rolled-back probe — validated 2026-07-07)
In one transaction that `RAISE`s at the end (rolls back → no drift), create three dummy views over dummy tables and assert the fixed check's verdict:

| dummy view | base table | expect flagged |
|---|---|---|
| `security_invoker` | no RLS | **yes** (real leak) |
| `security_invoker` | RLS enabled, deny-all | **no** (protected — the FP case) |
| `security_definer`, no gate | any | **yes** (regression: definer leak still caught) |

The old (unfixed) RPC flags all three (the middle one is the false positive); the fixed check must flag only the first and third.
