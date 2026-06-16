-- CMM-49/AAR-552: v_faelle_mit_aktuellem_termin t-LATERAL auf den kanonischen Selektor
-- public.get_aktueller_gt_termin_id umstellen (echtes Single-Source: View UND Writer teilen
-- EINE aktueller-Termin-Definition; vorher dupliziert View-inline vs RPC). Funktional
-- identisch — die RPC liefert exakt denselben Termin wie die bisherige inline-Status-Prio-
-- Selektion (DB-verifiziert: 0 mismatch ueber 82 claims; Output-md5 vor==nach).
-- Mechanik: surgischer regexp_replace der t-LATERAL-WHERE/ORDER/LIMIT-Klausel (gleiche Regex,
-- die die Klausel eindeutig matcht: gt.status-ANY ... erstes LIMIT 1), statt eine 18KB-View-Def
-- zu transkribieren. fail-loud (RAISE) falls das Muster nicht (mehr) passt — kein stiller No-Op.
DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  v_new := regexp_replace(
    v_def,
    'WHERE gt\.claim_id = c\.id AND \(gt\.status = ANY[\s\S]*?LIMIT 1',
    'WHERE gt.id = public.get_aktueller_gt_termin_id(c.id)'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'CMM-49: t-LATERAL-Muster in v_faelle_mit_aktuellem_termin nicht gefunden — Migration anpassen.';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_new;
END $mig$;
