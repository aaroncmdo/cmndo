-- CMM-49 P1b: faelle_kunde_view von faelle-ankernd auf claims-ankernd flippen (FROM faelle ->
-- FROM claims + faelle_claim_bridge). faelle-only-Reads repointen: id->fcb.fall_id, status->operative
-- (f.status-Fallback raus, Gap=0), kennzeichen/fahrzeug->veh-only (0 Fallback), auszahlung_kunde_*->NULL
-- (leer), kunde_id->geschaedigter_user_id. Output-Spalten/Namen/Typen + security (definer) via
-- CREATE OR REPLACE erhalten. Consumer (.eq('id', fallId)) laufen weiter (id=fall_id).
-- Verifiziert: FROM faelle weg, status vs faelle 0 diff. +1 Zeile (entity-native Claim, id=null, unerreichbar).
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.faelle_kunde_view'::regclass, true);

  ddl := replace(ddl, 'f.id,', 'fcb.fall_id AS id,');
  ddl := replace(ddl, 'COALESCE(c.operative_status::fall_status, f.status) AS status', 'c.operative_status::fall_status AS status');
  ddl := replace(ddl, 'COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen', 'veh.kennzeichen_aktuell::text AS kennzeichen');
  ddl := replace(ddl, 'COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller', 'veh.hersteller AS fahrzeug_hersteller');
  ddl := replace(ddl, 'COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell', 'veh.modell_haupttyp AS fahrzeug_modell');
  ddl := replace(ddl, 'COALESCE(EXTRACT(year FROM veh.baujahr_monat)::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr', 'EXTRACT(year FROM veh.baujahr_monat)::integer AS fahrzeug_baujahr');
  ddl := replace(ddl, 'f.auszahlung_kunde_betrag,', 'NULL::numeric(10,2) AS auszahlung_kunde_betrag,');
  ddl := replace(ddl, 'f.auszahlung_kunde_eingegangen_am,', 'NULL::timestamp with time zone AS auszahlung_kunde_eingegangen_am,');
  ddl := replace(ddl, 'f.kunde_id,', 'c.geschaedigter_user_id AS kunde_id,');
  ddl := regexp_replace(ddl, 'FROM faelle f\s+LEFT JOIN claims c ON c\.id = f\.claim_id',
    'FROM claims c' || chr(10) || '     LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id');

  IF ddl ~ '\mf\.' THEN RAISE EXCEPTION 'Rest-f.-Ref in faelle_kunde_view'; END IF;
  IF position('LEFT JOIN faelle_claim_bridge fcb' IN ddl) = 0 THEN RAISE EXCEPTION 'bridge-Join fehlt'; END IF;
  IF position('fcb.fall_id AS id' IN ddl) = 0 THEN RAISE EXCEPTION 'id-repoint fehlt'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.faelle_kunde_view AS ' || ddl;
END $mig$;
