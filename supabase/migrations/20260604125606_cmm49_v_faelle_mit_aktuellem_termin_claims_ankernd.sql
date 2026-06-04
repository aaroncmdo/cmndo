-- CMM-49 P1b: v_faelle_mit_aktuellem_termin von faelle-ankernd auf claims-ankernd flippen.
-- Routed: id->fcb.fall_id, lead_id->c.lead_id, kunde_id->geschaedigter, status->operative, Vehicle->veh-only,
-- konvertiert_am/mietwagen_kanzlei_informiert(+_am)/kunde_lat/lng->c.* (frisch backfilled), leasinggeber_name->c.*,
-- claim_id->c.id. NULL (leer + kein View-Consumer, Homes notiert): gegner_*/halter_*/firma_name/ust_id/bank_name/
-- dispatch_id/organisation_id/source_*/ist_fahrzeughalter/auszahlung_kunde_*/zahlung_erwartet_am/gegner_vs_anfrage.
-- Typen exakt erhalten. security (definer) via CREATE OR REPLACE. Guard: keine f.-Restref.
-- Verifiziert: FROM faelle weg, status/konv/mw/kennz vs faelle je 0 diff, 78 Zeilen.
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);

  ddl := replace(ddl, 'f.id,', 'fcb.fall_id AS id,');
  ddl := replace(ddl, 'f.lead_id,', 'c.lead_id,');
  ddl := replace(ddl, 'f.kunde_id,', 'c.geschaedigter_user_id AS kunde_id,');
  ddl := replace(ddl, 'COALESCE(c.operative_status::fall_status, f.status) AS status', 'c.operative_status::fall_status AS status');
  ddl := replace(ddl, 'COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen) AS kennzeichen', 'veh.kennzeichen_aktuell::text AS kennzeichen');
  ddl := replace(ddl, 'COALESCE(veh.bauart, f.fahrzeug_typ) AS fahrzeug_typ', 'veh.bauart AS fahrzeug_typ');
  ddl := replace(ddl, 'COALESCE(veh.hersteller, f.fahrzeug_hersteller) AS fahrzeug_hersteller', 'veh.hersteller AS fahrzeug_hersteller');
  ddl := replace(ddl, 'COALESCE(veh.modell_haupttyp, f.fahrzeug_modell) AS fahrzeug_modell', 'veh.modell_haupttyp AS fahrzeug_modell');
  ddl := replace(ddl, 'COALESCE(EXTRACT(year FROM veh.baujahr_monat)::integer, f.fahrzeug_baujahr) AS fahrzeug_baujahr', 'EXTRACT(year FROM veh.baujahr_monat)::integer AS fahrzeug_baujahr');
  ddl := replace(ddl, 'COALESCE(veh.fin_quelle, f.fin_quelle) AS fin_quelle', 'veh.fin_quelle AS fin_quelle');
  ddl := replace(ddl, 'COALESCE(veh.fin_extrahiert_am, f.fin_extrahiert_am) AS fin_extrahiert_am', 'veh.fin_extrahiert_am AS fin_extrahiert_am');
  ddl := replace(ddl, 'COALESCE(veh.farbe_klartext, f.fahrzeug_farbe) AS fahrzeug_farbe', 'veh.farbe_klartext AS fahrzeug_farbe');
  ddl := replace(ddl, 'COALESCE(veh.erstzulassung::text, f.erstzulassung) AS erstzulassung', 'veh.erstzulassung::text AS erstzulassung');
  ddl := replace(ddl, 'COALESCE(veh.aktueller_kilometerstand, f.kilometerstand) AS kilometerstand', 'veh.aktueller_kilometerstand AS kilometerstand');
  ddl := replace(ddl, 'COALESCE(veh.fahrzeug_ausstattung, f.fahrzeug_ausstattung) AS fahrzeug_ausstattung', 'veh.fahrzeug_ausstattung AS fahrzeug_ausstattung');
  ddl := replace(ddl, 'COALESCE(veh.fin::text, f.fin_vin) AS fin_vin', 'veh.fin::text AS fin_vin');
  ddl := replace(ddl, 'COALESCE(veh.hsn::text, f.hsn) AS hsn', 'veh.hsn::text AS hsn');
  ddl := replace(ddl, 'COALESCE(veh.tsn::text, f.tsn) AS tsn', 'veh.tsn::text AS tsn');
  ddl := replace(ddl, 'COALESCE(veh.farbcode, f.lackfarbe_code) AS lackfarbe_code', 'veh.farbcode AS lackfarbe_code');
  ddl := replace(ddl, 'f.konvertiert_am,', 'c.konvertiert_am,');
  ddl := replace(ddl, 'f.mietwagen_kanzlei_informiert,', 'c.mietwagen_kanzlei_informiert,');
  ddl := replace(ddl, 'f.mietwagen_kanzlei_informiert_am,', 'c.mietwagen_kanzlei_informiert_am,');
  ddl := replace(ddl, 'f.kunde_lat,', 'c.kunde_lat,');
  ddl := replace(ddl, 'f.kunde_lng,', 'c.kunde_lng,');
  ddl := replace(ddl, 'f.leasinggeber_name,', 'c.leasinggeber_name,');
  ddl := replace(ddl, 'f.claim_id,', 'c.id AS claim_id,');

  ddl := replace(ddl, 'f.gegner_name,', 'NULL::text AS gegner_name,');
  ddl := replace(ddl, 'f.gegner_versicherung,', 'NULL::text AS gegner_versicherung,');
  ddl := replace(ddl, 'f.gegner_kennzeichen,', 'NULL::text AS gegner_kennzeichen,');
  ddl := replace(ddl, 'f.ust_id,', 'NULL::text AS ust_id,');
  ddl := replace(ddl, 'f.bank_name,', 'NULL::text AS bank_name,');
  ddl := replace(ddl, 'f.dispatch_id,', 'NULL::uuid AS dispatch_id,');
  ddl := replace(ddl, 'f.firma_name,', 'NULL::text AS firma_name,');
  ddl := replace(ddl, 'f.organisation_id,', 'NULL::uuid AS organisation_id,');
  ddl := replace(ddl, 'f.gegner_anzahl_beteiligte,', 'NULL::integer AS gegner_anzahl_beteiligte,');
  ddl := replace(ddl, 'f.gegner_fahrzeugtyp,', 'NULL::text AS gegner_fahrzeugtyp,');
  ddl := replace(ddl, 'f.source_channel,', 'NULL::text AS source_channel,');
  ddl := replace(ddl, 'f.source_domain,', 'NULL::text AS source_domain,');
  ddl := replace(ddl, 'f.ist_fahrzeughalter,', 'NULL::boolean AS ist_fahrzeughalter,');
  ddl := replace(ddl, 'f.halter_vorname,', 'NULL::text AS halter_vorname,');
  ddl := replace(ddl, 'f.halter_nachname,', 'NULL::text AS halter_nachname,');
  ddl := replace(ddl, 'f.halter_strasse,', 'NULL::text AS halter_strasse,');
  ddl := replace(ddl, 'f.halter_plz,', 'NULL::text AS halter_plz,');
  ddl := replace(ddl, 'f.halter_stadt,', 'NULL::text AS halter_stadt,');
  ddl := replace(ddl, 'f.halter_telefon,', 'NULL::text AS halter_telefon,');
  ddl := replace(ddl, 'f.halter_email,', 'NULL::text AS halter_email,');
  ddl := replace(ddl, 'f.halter_geburtsdatum,', 'NULL::date AS halter_geburtsdatum,');
  ddl := replace(ddl, 'f.halter_name,', 'NULL::text AS halter_name,');
  ddl := replace(ddl, 'f.gegner_versicherung_anfrage_datum,', 'NULL::date AS gegner_versicherung_anfrage_datum,');
  ddl := replace(ddl, 'f.auszahlung_kunde_betrag,', 'NULL::numeric(10,2) AS auszahlung_kunde_betrag,');
  ddl := replace(ddl, 'f.auszahlung_kunde_eingegangen_am,', 'NULL::timestamp with time zone AS auszahlung_kunde_eingegangen_am,');
  ddl := replace(ddl, 'f.zahlung_erwartet_am,', 'NULL::date AS zahlung_erwartet_am,');

  ddl := regexp_replace(ddl, 'FROM faelle f\s+LEFT JOIN claims c ON c\.id = f\.claim_id',
    'FROM claims c' || chr(10) || '     LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id');

  IF ddl ~ '\mf\.' THEN RAISE EXCEPTION 'Rest-f.-Ref nach Repoint: %', substring(ddl from '\mf\.[a-z_]+'); END IF;
  IF position('LEFT JOIN faelle_claim_bridge fcb' IN ddl) = 0 THEN RAISE EXCEPTION 'bridge-Join fehlt'; END IF;
  IF position('fcb.fall_id AS id' IN ddl) = 0 THEN RAISE EXCEPTION 'id-repoint fehlt'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || ddl;
END $mig$;
