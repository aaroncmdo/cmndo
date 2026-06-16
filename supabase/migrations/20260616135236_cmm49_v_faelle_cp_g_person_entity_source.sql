-- CMM-49 / Entity Plan-5 (Flat-Drop, Schritt 3): v_faelle_mit_aktuellem_termin cp_g-LATERAL
-- (geschaedigter-Kontakt -> kunde_vorname/nachname/telefon/strasse/plz/stadt/adresse) liest
-- bislang claim_parties DIREKT flat. Auf entity-primaer umstellen: LEFT JOIN personen via
-- person_id + COALESCE(pe.x, cp.x). personen = Primaerquelle, flat = Fallback (transitional bis
-- zum DROP-Cutover). Output-IDENTISCH (DB-verifiziert: 0 Divergenz ueber alle 6 Felder /
-- vorname,nachname,telefon,adresse_strasse,adresse_plz,adresse_ort; md5 der 7 kunde_*-Outputs
-- vor==nach). adresse_plz::text-Cast im COALESCE haelt den Typ (cp.adresse_plz=varchar,
-- pe.adresse_plz=text) — identisch zum bestehenden v_claim_full.kunde_p-Muster.
-- Mechanik: surgischer regexp_replace der eindeutigen cp_g-LATERAL-Klausel (fail-loud RAISE
-- falls Muster nicht passt). CREATE OR REPLACE erhaelt reloptions.
DO $mig$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  v_new := regexp_replace(
    v_def,
    'LEFT JOIN LATERAL \( SELECT cp\.vorname,[\s\S]*?LIMIT 1\) cp_g ON true',
    'LEFT JOIN LATERAL ( SELECT COALESCE(pe.vorname, cp.vorname) AS vorname, COALESCE(pe.nachname, cp.nachname) AS nachname, COALESCE(pe.telefon, cp.telefon) AS telefon, COALESCE(pe.adresse_strasse, cp.adresse_strasse) AS adresse_strasse, COALESCE(pe.adresse_plz, cp.adresse_plz::text) AS adresse_plz, COALESCE(pe.adresse_ort, cp.adresse_ort) AS adresse_ort FROM claim_parties cp LEFT JOIN personen pe ON pe.id = cp.person_id WHERE cp.claim_id = c.id AND cp.rolle = ''geschaedigter''::text ORDER BY cp.created_at, cp.id LIMIT 1) cp_g ON true'
  );
  IF v_new = v_def THEN
    RAISE EXCEPTION 'CMM-49: cp_g-LATERAL in v_faelle_mit_aktuellem_termin nicht gefunden — Migration anpassen.';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_new;
END $mig$;
