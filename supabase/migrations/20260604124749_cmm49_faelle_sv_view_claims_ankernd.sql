-- CMM-49 P1b: faelle_sv_view claims-ankernd (FROM claims + faelle_claim_bridge). Repoints: id->fcb.fall_id,
-- status->operative, vehicle->veh-only, kunde_id->geschaedigter. Typen/Namen/security (definer) erhalten.
-- Verifiziert: FROM faelle weg, status vs faelle 0 diff.
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.faelle_sv_view'::regclass, true);

  ddl := replace(ddl, 'f.id,', 'fcb.fall_id AS id,');
  ddl := replace(ddl, 'COALESCE(c.operative_status::fall_status, f.status) AS status', 'c.operative_status::fall_status AS status');
  ddl := replace(ddl, 'COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen', 'veh.kennzeichen_aktuell::text AS kennzeichen');
  ddl := replace(ddl, 'COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller', 'veh.hersteller AS fahrzeug_hersteller');
  ddl := replace(ddl, 'COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell', 'veh.modell_haupttyp AS fahrzeug_modell');
  ddl := replace(ddl, 'COALESCE(EXTRACT(year FROM veh.baujahr_monat)::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr', 'EXTRACT(year FROM veh.baujahr_monat)::integer AS fahrzeug_baujahr');
  ddl := replace(ddl, 'f.kunde_id,', 'c.geschaedigter_user_id AS kunde_id,');
  ddl := regexp_replace(ddl, 'FROM faelle f\s+LEFT JOIN claims c ON c\.id = f\.claim_id',
    'FROM claims c' || chr(10) || '     LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id');

  IF ddl ~ '\mf\.' THEN RAISE EXCEPTION 'Rest-f.-Ref in faelle_sv_view'; END IF;
  IF position('LEFT JOIN faelle_claim_bridge fcb' IN ddl) = 0 THEN RAISE EXCEPTION 'bridge-Join fehlt'; END IF;
  IF position('fcb.fall_id AS id' IN ddl) = 0 THEN RAISE EXCEPTION 'id-repoint fehlt'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.faelle_sv_view AS ' || ddl;
END $mig$;
