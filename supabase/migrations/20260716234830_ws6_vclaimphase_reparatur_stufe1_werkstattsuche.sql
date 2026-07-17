-- WS6/Kasko-Fix Nachtrag (17.07., Parity-Gate-Fund am ersten Lauf): Stufe 1 der Reparatur-Lane
-- hiess in der View 'onboarding_offen' (Alt-Selbstzahler-CASE), in der WS6-TS-Taxonomie
-- 'werkstattwahl'. Vereinheitlicht auf die NEUERE WS6-Taxonomie: der ersterfassung/onboarding-
-- Arm des Selbstzahler-sub_phase-CASE liefert 'reparatur-werkstatt-suche'. (Alternative —
-- Onboarding-Stufe beidseitig — im PR dokumentiert; 'onboarding_offen' bleibt fuer die echten
-- Erfassungs-Wege unveraendert.) Nur der sub-Arm; der main-Arm (AND-geklammert, THEN 'erfassung')
-- matcht das Muster nicht.
DO $$
DECLARE v_def text; v_neu text; v_cnt int;
BEGIN
  v_def := pg_get_viewdef('public.v_claim_phase'::regclass, true);
  v_cnt := (SELECT count(*) FROM regexp_matches(v_def,
    '= ANY \(ARRAY\[''ersterfassung''::text, ''onboarding''::text\]\) THEN ''onboarding_offen''::text', 'g'));
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'v_claim_phase: erwartet 1 onboarding_offen-Reparatur-Arm, gefunden %', v_cnt;
  END IF;
  v_neu := replace(v_def,
    '= ANY (ARRAY[''ersterfassung''::text, ''onboarding''::text]) THEN ''onboarding_offen''::text',
    '= ANY (ARRAY[''ersterfassung''::text, ''onboarding''::text]) THEN ''reparatur-werkstatt-suche''::text');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_phase AS ' || v_neu;
END $$;
