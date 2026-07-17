-- Maik Phase 2 (Contract step of expand-contract): drop the provisionen_maik ledger + marketing_partner
-- config tables. Reader code was removed and prod-deployed via #4505 (main R63/#4509, 2026-07-17 12:36 CEST),
-- so no runtime path reads these tables anymore.
--
-- Prod facts at apply time (read-verified): provisionen_maik = 0 rows; abrechnungen empfaenger_typ='marketing' = 0 rows.
-- marketing_partner held exactly 1 config row (preserved here for audit; zero transactional data referenced it):
--   {"id":"fc4471e6-5f8c-42e2-84a6-854880b79b24","name":"Maik (Marketing)","email":null,
--    "ist_kleinunternehmer":null,"erstellt_am":"2026-07-04T12:33:22.212776+00:00",
--    "ust_id":null,"adresse_strasse":null,"adresse_plz":null,"adresse_ort":null}
-- Only dependent object across the DB = view v_partner_billing (branch 7 of 9). No incoming FKs; the one FK is
-- provisionen_maik.marketing_partner_id -> marketing_partner, so provisionen_maik must be dropped FIRST.

-- Step 1: rewrite v_partner_billing WITHOUT the provisionen_maik/marketing branch.
-- Programmatic slice of the LIVE definition (no hand-transcription of the 200-line money view): split on
-- 'UNION ALL', drop the single branch that references the maik tables, rejoin the other 8 byte-identically.
-- Self-asserting: aborts (transaction rollback) unless exactly 1 branch is removed and 8 remain.
DO $mig$
DECLARE
  v_old   text := pg_get_viewdef('public.v_partner_billing'::regclass, true);
  parts   text[];
  kept    text[] := ARRAY[]::text[];
  p       text;
  removed int := 0;
BEGIN
  parts := regexp_split_to_array(v_old, 'UNION ALL');
  FOREACH p IN ARRAY parts LOOP
    IF position('provisionen_maik' in p) > 0 OR position('marketing_partner' in p) > 0 THEN
      removed := removed + 1;
    ELSE
      kept := array_append(kept, p);
    END IF;
  END LOOP;
  IF removed <> 1 THEN
    RAISE EXCEPTION 'v_partner_billing rewrite: expected exactly 1 maik branch, found %', removed;
  END IF;
  IF array_length(kept, 1) <> 8 THEN
    RAISE EXCEPTION 'v_partner_billing rewrite: expected 8 kept branches, got %', array_length(kept, 1);
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_partner_billing AS ' || array_to_string(kept, 'UNION ALL');
END
$mig$;

-- Step 2: drop the tables (provisionen_maik first — it FKs marketing_partner). Plain DROP (no CASCADE): any
-- unexpected remaining dependency fails loudly instead of being silently cascaded away.
DROP TABLE public.provisionen_maik;
DROP TABLE public.marketing_partner;

-- Step 3: tighten abrechnungen.empfaenger_typ CHECK — remove the now-impossible 'marketing' value (0 rows use it).
ALTER TABLE public.abrechnungen DROP CONSTRAINT abrechnungen_empfaenger_typ_check;
ALTER TABLE public.abrechnungen ADD CONSTRAINT abrechnungen_empfaenger_typ_check
  CHECK (empfaenger_typ = ANY (ARRAY['kanzlei'::text, 'sv'::text, 'makler'::text]));
