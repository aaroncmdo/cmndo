-- RLS-Haertung: stray anon-SELECT-Grant auf v_claim_parties_safe entfernen.
-- Der Row-Gate (Task 3) blockt anon bereits (0 Rows verifiziert), aber der Grant blieb
-- (wie bei v_claim_base). 0 Code-Consumer (nur database.types.ts) -> risikolos.
-- Defense-in-depth + macht den check:claim-view-rls-Guard strikt (kein anon auf Claim-Views).
revoke select on public.v_claim_parties_safe from anon;
