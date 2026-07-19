-- Perf-Advisor-Analyse 17.07. (AUDIT-db-index-hygiene-decision): der EINZIGE usage-
-- unabhaengige Safe-Drop. faelle_claim_bridge hat ZWEI btree-Indizes auf claim_id:
--   faelle_claim_bridge_claim_id_key (UNIQUE, constraint-backing) -> BLEIBT
--   idx_faelle_claim_bridge_claim_id (plain, backs_any_constraint=false) -> redundant
-- Der Unique-Index deckt alle Reads des plain-Index (Equality/Range/Ordering/FK-Target) ab.
-- Verifiziert: plain-Index backt KEIN Constraint -> DROP bricht keine FK. Reversibel.
DROP INDEX IF EXISTS public.idx_faelle_claim_bridge_claim_id;
