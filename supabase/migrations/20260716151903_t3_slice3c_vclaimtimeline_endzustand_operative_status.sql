-- T3-slice-3c: v_claim_timeline_ungated_internal Endzustand-Branch von claims.status auf operative_status.
-- FIXT eine slice-1b-Regression + einen Alt-Bug:
--   (1) Seit B4-slice-1b schreiben NON-terminale Endzustaende (in_kommunikation_vs, abgelehnt) nur noch
--       operative_status -> der alte Filter c.status = ANY(...) matchte sie nie mehr -> Timeline-Events weg.
--   (2) 'reguliert' im Alt-Filter existiert als Wert nicht (heisst reguliert_vollstaendig) und die feinen
--       Terminals (klage_rechtsstreit/verjaehrt/abgelehnt_final) fehlten komplett -> deren Events erschienen NIE.
-- Neu: Filter = alle 8 endzustand-setzbaren operative_status-Werte. Event-ID (md5), Event-Typ ('claim.<x>')
-- und Payload.status speisen sich aus operative_status. Fuer Terminals sind die Werte identisch (Konvergenz)
-- -> keine UUID-/Typ-Flaps bestehender Events.
-- Guarded dynamic-replace: Die View ist ~300 Zeilen (viele UNION-Branches); haendische Transkription waere
-- fehleranfaelliger als ein exakt-asserteter Replace der 4 c.status-Sites. Asserts brechen bei Drift hart ab.
DO $$
DECLARE v_def text; v_neu text; v_cnt int;
BEGIN
  v_def := pg_get_viewdef('public.v_claim_timeline_ungated_internal'::regclass, true);
  v_cnt := (SELECT count(*) FROM regexp_matches(v_def, '\mc\.status\M', 'g'));
  IF v_cnt <> 4 THEN
    RAISE EXCEPTION 'v_claim_timeline: erwartet 4 c.status-Referenzen, gefunden %', v_cnt;
  END IF;
  v_neu := replace(v_def,
    'c.status = ANY (ARRAY[''in_kommunikation_vs''::text, ''reguliert''::text, ''abgelehnt''::text, ''an_externe_kanzlei_uebergeben''::text, ''storniert''::text])',
    'c.operative_status = ANY (ARRAY[''in_kommunikation_vs''::text, ''abgelehnt''::text, ''reguliert_vollstaendig''::text, ''klage_rechtsstreit''::text, ''verjaehrt''::text, ''abgelehnt_final''::text, ''an_externe_kanzlei_uebergeben''::text, ''storniert''::text])');
  v_neu := regexp_replace(v_neu, '\|\| c\.status\)::uuid', '|| c.operative_status)::uuid');
  v_neu := regexp_replace(v_neu, '''claim\.''::text \|\| c\.status', '''claim.''::text || c.operative_status');
  v_neu := regexp_replace(v_neu, '\(''status'', c\.status,', '(''status'', c.operative_status,');
  IF v_neu ~ '\mc\.status\M' THEN
    RAISE EXCEPTION 'v_claim_timeline: c.status-Referenz nach Replace uebrig — Def-Drift, Migration abgebrochen';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_timeline_ungated_internal AS ' || v_neu;
END $$;
