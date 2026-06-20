-- CMM-49 gegner Tier-2 Cutover Schritt 2/2: v_claim_full + v_faelle + v_claim_sv gegner_vsnr/az
-- COALESCE(party, claims) -> party flippen, dann claims.gegner_versicherungsnummer/aktenzeichen
-- DROPpen (IRREVERSIBEL). Vorbedingungen verifiziert (20.06.): 6 Prep-PRs prod-deployed (main 1fbd914ba);
-- Reader via Views (get-claim-for-role:173); Writer -> verursacher-party; named_deps = nur die 3 Views;
-- Backfill (Schritt 1) -> still_flip_to_null=0. Scope NUR vsnr+az (NICHT gegner_versicherung_id [Live-FK
-- gv-Join] / gegner_bekannt [kept claim-flag]). SSoT danach = verursacher-claim_party.

-- View 1: v_claim_full (gp = verursacher-party)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.v_claim_full'::regclass, true);
  IF position('COALESCE(gp.versicherungsnummer, c.gegner_versicherungsnummer)' in d)=0 THEN RAISE EXCEPTION 'v_claim_full: vsnr pattern missing'; END IF;
  IF position('COALESCE(gp.versicherungs_aktenzeichen, c.gegner_aktenzeichen)' in d)=0 THEN RAISE EXCEPTION 'v_claim_full: az pattern missing'; END IF;
  d := replace(d, 'COALESCE(gp.versicherungsnummer, c.gegner_versicherungsnummer)', 'gp.versicherungsnummer');
  d := replace(d, 'COALESCE(gp.versicherungs_aktenzeichen, c.gegner_aktenzeichen)', 'gp.versicherungs_aktenzeichen');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || d;
END $$;

-- View 2: v_faelle_mit_aktuellem_termin (vp_g = verursacher-party; az-Output heisst gegner_schadennummer)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  IF position('COALESCE(vp_g.versicherungsnummer, c.gegner_versicherungsnummer)' in d)=0 THEN RAISE EXCEPTION 'v_faelle: vsnr pattern missing'; END IF;
  IF position('COALESCE(vp_g.versicherungs_aktenzeichen, c.gegner_aktenzeichen)' in d)=0 THEN RAISE EXCEPTION 'v_faelle: az pattern missing'; END IF;
  d := replace(d, 'COALESCE(vp_g.versicherungsnummer, c.gegner_versicherungsnummer)', 'vp_g.versicherungsnummer');
  d := replace(d, 'COALESCE(vp_g.versicherungs_aktenzeichen, c.gegner_aktenzeichen)', 'vp_g.versicherungs_aktenzeichen');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || d;
END $$;

-- View 3: v_claim_sv (vp_g = verursacher-party) — security_invoker=false ERHALTEN (auth-gated, sonst RLS-Reset)
DO $$
DECLARE d text;
BEGIN
  d := pg_get_viewdef('public.v_claim_sv'::regclass, true);
  IF position('COALESCE(vp_g.versicherungsnummer, c.gegner_versicherungsnummer)' in d)=0 THEN RAISE EXCEPTION 'v_claim_sv: vsnr pattern missing'; END IF;
  IF position('COALESCE(vp_g.versicherungs_aktenzeichen, c.gegner_aktenzeichen)' in d)=0 THEN RAISE EXCEPTION 'v_claim_sv: az pattern missing'; END IF;
  d := replace(d, 'COALESCE(vp_g.versicherungsnummer, c.gegner_versicherungsnummer)', 'vp_g.versicherungsnummer');
  d := replace(d, 'COALESCE(vp_g.versicherungs_aktenzeichen, c.gegner_aktenzeichen)', 'vp_g.versicherungs_aktenzeichen');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_sv WITH (security_invoker=false) AS ' || d;
END $$;

-- DROP (irreversibel) — nach Flip referenziert nichts mehr c.gegner_vsnr/az.
ALTER TABLE public.claims DROP COLUMN gegner_versicherungsnummer, DROP COLUMN gegner_aktenzeichen;
