-- CMM Entity Phase-4c: v_claim_full.halter_* (Person-Felder) aus claim_parties (ist_halter-Partei)
-- statt aus flachem claims.halter_* (#2315-Dupe, leer). Spaltennamen+Typen erhalten => kein
-- Consumer-Code-Change (get-kunde-faelle/ClaimSummary lesen weiter v_claim_full.halter_*, jetzt
-- aus der Entitaet). Deploy-safe (kein Drop hier; claims.halter_*-Drop = Follow-up nach Prod-
-- Deploy des ocr-Writer-Fix, "b dann a"). c.halter_ungleich_fahrer (Boolean) BLEIBT.
-- pg_get_viewdef + gezielte Replaces + Guard (kein Hand-Transkript des Views). Pattern wie cmm74.
DO $mig$
DECLARE ddl text;
BEGIN
  ddl := pg_get_viewdef('public.v_claim_full'::regclass, true);

  ddl := replace(ddl,
    E'     LEFT JOIN faelle f ON f.claim_id = c.id\n',
    E'     LEFT JOIN faelle f ON f.claim_id = c.id\n     LEFT JOIN LATERAL ( SELECT hp.vorname, hp.nachname, hp.adresse_strasse, hp.adresse_plz, hp.adresse_ort, hp.telefon, hp.email, hp.geburtsdatum\n            FROM claim_parties hp\n           WHERE hp.claim_id = c.id AND hp.ist_halter = true\n           ORDER BY hp.reihenfolge, hp.created_at\n          LIMIT 1) halter_p ON true\n');

  ddl := replace(ddl,
    E'    c.halter_vorname,\n    c.halter_nachname,\n    c.halter_strasse,\n    c.halter_plz,\n    c.halter_stadt,\n    c.halter_telefon,\n    c.halter_email,\n    c.halter_geburtsdatum,\n    c.halter_name',
    E'    halter_p.vorname AS halter_vorname,\n    halter_p.nachname AS halter_nachname,\n    halter_p.adresse_strasse AS halter_strasse,\n    halter_p.adresse_plz::text AS halter_plz,\n    halter_p.adresse_ort AS halter_stadt,\n    halter_p.telefon AS halter_telefon,\n    halter_p.email AS halter_email,\n    halter_p.geburtsdatum AS halter_geburtsdatum,\n    NULLIF(TRIM(BOTH FROM (COALESCE(halter_p.vorname, ''''::text) || '' ''::text) || COALESCE(halter_p.nachname, ''''::text)), ''''::text) AS halter_name');

  IF position('halter_p.vorname AS halter_vorname' IN ddl) = 0 THEN
    RAISE EXCEPTION 'halter-repoint (#2) hat nicht gegriffen';
  END IF;
  IF position('c.halter_vorname' IN ddl) > 0 OR position('c.halter_name' IN ddl) > 0
     OR position('c.halter_geburtsdatum' IN ddl) > 0 THEN
    RAISE EXCEPTION 'c.halter_<person> noch vorhanden nach repoint';
  END IF;
  IF position('halter_p ON true' IN ddl) = 0 THEN
    RAISE EXCEPTION 'halter-LATERAL (#1) hat nicht gegriffen';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_claim_full AS ' || ddl;
END
$mig$;
