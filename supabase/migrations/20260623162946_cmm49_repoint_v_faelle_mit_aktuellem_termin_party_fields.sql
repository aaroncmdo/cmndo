-- CMM-49: v_faelle_mit_aktuellem_termin (Haupt-Fallakte-Reader) sourcte halter_*/gegner_*/
-- ist_fahrzeughalter als NULL-Platzhalter (Party-Entity-Migration nicht nachgezogen) -> Fallakte
-- zeigte sie leer trotz korrekter Writes. Hier auf dieselben Entity-LATERALs wie v_claim_full
-- repointen (halter_p + gf/gpp/gv/gveh; cp_g+ist_halter; vp_g+firma_id/person_id/kennzeichen/
-- klartext/vehicle_id). Reliabler String-Transform der Live-Viewdef (kein 200-Zeilen-Copy) mit
-- Guard: bricht ab statt eine kaputte View zu schreiben. Idempotent.
DO $mig$
DECLARE v_def text;
BEGIN
  v_def := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin', true);
  IF position('NULL::text AS halter_nachname,' IN v_def) = 0 THEN
    RAISE NOTICE 'CMM-49: bereits repointet, skip';
    RETURN;
  END IF;
  v_def := replace(v_def, $w$            pe.adresse_ort
           FROM claim_parties cp$w$, $w$            pe.adresse_ort,
            cp.ist_halter
           FROM claim_parties cp$w$);
  v_def := replace(v_def, $w$            vpp.versicherungs_aktenzeichen
           FROM claim_parties vpp$w$, $w$            vpp.versicherungs_aktenzeichen,
            vpp.firma_id,
            vpp.person_id,
            vpp.kennzeichen,
            vpp.versicherung_klartext,
            vpp.fahrzeugtyp_klartext,
            vpp.vehicle_id
           FROM claim_parties vpp$w$);
  v_def := replace(v_def, $w$) vp_g ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id$w$, $w$) vp_g ON true
     LEFT JOIN LATERAL ( SELECT pe.vorname, pe.nachname, pe.adresse_strasse, pe.adresse_plz, pe.adresse_ort, pe.telefon, pe.email, pe.geburtsdatum
           FROM claim_parties hp LEFT JOIN personen pe ON pe.id = hp.person_id
          WHERE hp.claim_id = c.id AND hp.ist_halter = true
          ORDER BY hp.reihenfolge, hp.created_at LIMIT 1) halter_p ON true
     LEFT JOIN firmen gf ON gf.id = vp_g.firma_id
     LEFT JOIN personen gpp ON gpp.id = vp_g.person_id
     LEFT JOIN versicherungen gv ON gv.id = c.gegner_versicherung_id
     LEFT JOIN vehicles gveh ON gveh.id = vp_g.vehicle_id
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id$w$);
  v_def := replace(v_def, $w$    NULL::text AS gegner_name,$w$, $w$    COALESCE(gf.name, NULLIF(TRIM(BOTH FROM (COALESCE(gpp.vorname, ''::text) || ' '::text) || COALESCE(gpp.nachname, ''::text)), ''::text)) AS gegner_name,$w$);
  v_def := replace(v_def, $w$    NULL::text AS gegner_versicherung,$w$, $w$    COALESCE(gv.name, vp_g.versicherung_klartext) AS gegner_versicherung,$w$);
  v_def := replace(v_def, $w$    NULL::text AS gegner_kennzeichen,$w$, $w$    COALESCE(gveh.kennzeichen_aktuell, vp_g.kennzeichen)::text AS gegner_kennzeichen,$w$);
  v_def := replace(v_def, $w$    NULL::integer AS gegner_anzahl_beteiligte,$w$, $w$    (c.anzahl_beteiligte_total - 1) AS gegner_anzahl_beteiligte,$w$);
  v_def := replace(v_def, $w$    NULL::text AS gegner_fahrzeugtyp,$w$, $w$    COALESCE(gveh.bauart, vp_g.fahrzeugtyp_klartext) AS gegner_fahrzeugtyp,$w$);
  v_def := replace(v_def, $w$    NULL::boolean AS ist_fahrzeughalter,$w$, $w$    cp_g.ist_halter AS ist_fahrzeughalter,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_vorname,$w$, $w$    halter_p.vorname AS halter_vorname,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_nachname,$w$, $w$    halter_p.nachname AS halter_nachname,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_strasse,$w$, $w$    halter_p.adresse_strasse AS halter_strasse,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_plz,$w$, $w$    halter_p.adresse_plz AS halter_plz,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_stadt,$w$, $w$    halter_p.adresse_ort AS halter_stadt,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_telefon,$w$, $w$    halter_p.telefon AS halter_telefon,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_email,$w$, $w$    halter_p.email AS halter_email,$w$);
  v_def := replace(v_def, $w$    NULL::date AS halter_geburtsdatum,$w$, $w$    halter_p.geburtsdatum AS halter_geburtsdatum,$w$);
  v_def := replace(v_def, $w$    NULL::text AS halter_name,$w$, $w$    NULLIF(TRIM(BOTH FROM (COALESCE(halter_p.vorname, ''::text) || ' '::text) || COALESCE(halter_p.nachname, ''::text)), ''::text) AS halter_name,$w$);
  IF position('NULL::text AS halter_nachname,' IN v_def) > 0
     OR position('NULL::boolean AS ist_fahrzeughalter,' IN v_def) > 0
     OR position('NULL::text AS gegner_name,' IN v_def) > 0
     OR position('NULL::text AS gegner_kennzeichen,' IN v_def) > 0
     OR position(') halter_p ON true' IN v_def) = 0
     OR position('LEFT JOIN firmen gf ON gf.id = vp_g.firma_id' IN v_def) = 0
     OR position('cp.ist_halter' IN v_def) = 0
     OR position('vpp.firma_id,' IN v_def) = 0
  THEN
    RAISE EXCEPTION 'CMM-49 view-repoint: Transform unvollstaendig — abgebrochen (keine Aenderung).';
  END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || v_def;
END $mig$;
