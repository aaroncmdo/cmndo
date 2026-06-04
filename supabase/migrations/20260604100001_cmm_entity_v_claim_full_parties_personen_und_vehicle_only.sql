-- CMM Entity Phase-4: v_claim_full Person+Vehicle vollstaendig aus den Entitaeten.
-- (1) parties-jsonb: Person-DATEN aus personen (Entitaet) statt claim_parties-Flat (gleiche
--     falsche Schicht wie halter). Overlay personen-Werte auf die Flat-Keys (vorname...) +
--     nested 'person' = volle Entitaet. 74/74 gelinkt, 0 Mismatch -> value-preserving; ueberlebt
--     den Phase-5-claim_parties-Flat-Drop (Keys kommen dann aus dem Overlay).
-- (2) Vehicle-COALESCEs: faelle-Flat-Fallback raus, nur vehicles-Entitaet (0x Fallback genutzt,
--     verifiziert). fall_status/fall_id/fall_created_at + faelle-Join bleiben HIER (= Retire-
--     Strecke CMM-49 4a/T1.2-d, koordiniert, nicht in diesem Slice).
-- pg_get_viewdef + Replaces + Guards. Halter (personen, 20260604093335) bleibt unberuehrt.
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.v_claim_full'::regclass, true);

  ddl := replace(ddl, 'COALESCE(veh.kennzeichen_aktuell::text, f.kennzeichen)', 'veh.kennzeichen_aktuell::text');
  ddl := replace(ddl, 'COALESCE(veh.hersteller, f.fahrzeug_hersteller)', 'veh.hersteller');
  ddl := replace(ddl, 'COALESCE(veh.modell_haupttyp, f.fahrzeug_modell)', 'veh.modell_haupttyp');
  ddl := replace(ddl, 'COALESCE(veh.bauart, f.fahrzeug_typ)', 'veh.bauart');

  ddl := regexp_replace(ddl,
    'jsonb_agg\(to_jsonb\(cp\.\*\) ORDER BY cp\.reihenfolge, cp\.created_at\)',
    'jsonb_agg((to_jsonb(cp.*) || jsonb_build_object(''vorname'', p.vorname, ''nachname'', p.nachname, ''adresse_strasse'', p.adresse_strasse, ''adresse_plz'', p.adresse_plz, ''adresse_ort'', p.adresse_ort, ''telefon'', p.telefon, ''email'', p.email, ''geburtsdatum'', p.geburtsdatum, ''person'', to_jsonb(p.*))) ORDER BY cp.reihenfolge, cp.created_at)');
  ddl := regexp_replace(ddl,
    '(FROM claim_parties cp)(\s+WHERE cp\.claim_id = c\.id\),)',
    '\1 LEFT JOIN personen p ON p.id = cp.person_id\2');

  IF ddl ~ 'COALESCE\(veh\.' THEN RAISE EXCEPTION 'vehicle-COALESCE noch da'; END IF;
  IF position('f.kennzeichen' IN ddl) > 0 OR position('f.fahrzeug_hersteller' IN ddl) > 0
     OR position('f.fahrzeug_modell' IN ddl) > 0 OR position('f.fahrzeug_typ' IN ddl) > 0 THEN
    RAISE EXCEPTION 'f.fahrzeug/kennzeichen-ref noch da'; END IF;
  IF position('LEFT JOIN personen p ON p.id = cp.person_id' IN ddl) = 0 THEN
    RAISE EXCEPTION 'parties personen-JOIN nicht injiziert'; END IF;
  IF position('to_jsonb(p.*)' IN ddl) = 0 THEN
    RAISE EXCEPTION 'parties personen-overlay nicht injiziert'; END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || ddl;
END
$mig$;
