-- WS6/Kasko-Fix (17.07.): v_claim_phase behandelt derive_abrechnungsweg='kasko' wie
-- 'selbstzahler' (Reparatur-Strecke). Vorher lief kasko in den normalen Zweig -> o_sub
-- ersterfassung -> SA-Kaskade -> "SA-Unterschrift offen" fuer Wege, die by design nie eine
-- SA haben (Live-Beleg Claim 39734007, abrechnungsweg=kasko, derived=kasko).
-- Spiegelbildlich zum TS-Fix (lifecycle.ts erfassungsSubphase/reparaturSubphase).
-- Guarded dynamic-replace: exakt 2 CASE-Koepfe (main_phase + sub_phase), Assert bricht bei Drift.
DO $$
DECLARE v_def text; v_neu text; v_cnt int;
BEGIN
  v_def := pg_get_viewdef('public.v_claim_phase'::regclass, true);
  v_cnt := (SELECT count(*) FROM regexp_matches(v_def,
    'derive_abrechnungsweg\(co\.service_typ, lo\.schuldfrage, lo\.eigene_versicherung, co\.schadenart\) = ''selbstzahler''::text', 'g'));
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'v_claim_phase: erwartet 2 selbstzahler-CASE-Koepfe, gefunden %', v_cnt;
  END IF;
  v_neu := replace(v_def,
    'derive_abrechnungsweg(co.service_typ, lo.schuldfrage, lo.eigene_versicherung, co.schadenart) = ''selbstzahler''::text',
    'derive_abrechnungsweg(co.service_typ, lo.schuldfrage, lo.eigene_versicherung, co.schadenart) = ANY (ARRAY[''selbstzahler''::text, ''kasko''::text])');
  IF v_neu ~ '= ''selbstzahler''::text' THEN
    RAISE EXCEPTION 'v_claim_phase: selbstzahler-Vergleich nach Replace uebrig';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_phase AS ' || v_neu;
END $$;
