-- Follow-up zur Ableiter-Vereinheitlichung (Problem B, Mig 20260804161329):
-- Die 3 Views leiten abrechnungsweg aus lead.schuldfrage ab -> lead-lose Claims
-- (Lead per DSGVO geloescht) zeigen null statt des echten Wegs (z.B. CLM-2026-01011:
-- Spalte='haftpflicht' korrekt, View=null). Fix: COALESCE(claims.schuldfrage, lead.schuldfrage)
-- (Claim-Vorrang, Lead-Fallback). Regressionsfrei (prod-Analyse: 0 Konfliktfaelle, wo beide
-- gesetzt sind sie identisch; 15 claim-null-lead-gesetzt fallen sauber auf lead zurueck).
-- Imperativ (pg_get_viewdef + replace) statt volle Def-Reproduktion -> minimales Fehlerrisiko
-- an den grossen Views; idempotent (skip wenn COALESCE schon da) -> db-reset-robust.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  -- 1. v_werkstatt_auftrag (c = claims direkt)
  SELECT pg_get_viewdef('public.v_werkstatt_auftrag'::regclass, true) INTO v_def;
  IF v_def NOT LIKE '%COALESCE(c.schuldfrage, l.schuldfrage)%' THEN
    v_new := replace(v_def,
      'derive_abrechnungsweg(c.service_typ, l.schuldfrage, l.eigene_versicherung, c.schadenart)',
      'derive_abrechnungsweg(c.service_typ, COALESCE(c.schuldfrage, l.schuldfrage), COALESCE(c.eigene_versicherung, l.eigene_versicherung), c.schadenart)');
    IF v_new = v_def THEN RAISE EXCEPTION 'v_werkstatt_auftrag: derive-Zeile nicht gefunden'; END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.v_werkstatt_auftrag AS ' || regexp_replace(v_new, ';[[:space:]]*$', '');
  END IF;

  -- 2. v_claim_phase (co = claims direkt, 2 derive-Vorkommen)
  SELECT pg_get_viewdef('public.v_claim_phase'::regclass, true) INTO v_def;
  IF v_def NOT LIKE '%COALESCE(co.schuldfrage, lo.schuldfrage)%' THEN
    v_new := replace(v_def,
      'derive_abrechnungsweg(co.service_typ, lo.schuldfrage, lo.eigene_versicherung, co.schadenart)',
      'derive_abrechnungsweg(co.service_typ, COALESCE(co.schuldfrage, lo.schuldfrage), COALESCE(co.eigene_versicherung, lo.eigene_versicherung), co.schadenart)');
    IF v_new = v_def THEN RAISE EXCEPTION 'v_claim_phase: derive-Zeile nicht gefunden'; END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_phase AS ' || regexp_replace(v_new, ';[[:space:]]*$', '');
  END IF;

  -- 3. v_claim_base (sub = Subquery ohne schuldfrage -> claims clm_sf join hinzufuegen)
  SELECT pg_get_viewdef('public.v_claim_base'::regclass, true) INTO v_def;
  IF v_def NOT LIKE '%COALESCE(clm_sf.schuldfrage, lb.schuldfrage)%' THEN
    v_new := replace(v_def,
      'LEFT JOIN leads lb ON lb.id = sub.lead_id',
      E'LEFT JOIN leads lb ON lb.id = sub.lead_id\n     LEFT JOIN claims clm_sf ON clm_sf.id = sub.id');
    IF v_new = v_def THEN RAISE EXCEPTION 'v_claim_base: leads-join nicht gefunden'; END IF;
    v_def := v_new;
    v_new := replace(v_def,
      'derive_abrechnungsweg(sub.service_typ, lb.schuldfrage, lb.eigene_versicherung, sub.schadenart)',
      'derive_abrechnungsweg(sub.service_typ, COALESCE(clm_sf.schuldfrage, lb.schuldfrage), COALESCE(clm_sf.eigene_versicherung, lb.eigene_versicherung), sub.schadenart)');
    IF v_new = v_def THEN RAISE EXCEPTION 'v_claim_base: derive-Zeile nicht gefunden'; END IF;
    EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_base AS ' || regexp_replace(v_new, ';[[:space:]]*$', '');
  END IF;
END $$;
