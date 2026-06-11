-- CMM-Entity Plan 4.3: ist_fahrzeughalter party-native in v_claim_full (CMM-49s letzter entity-gated Reader, erwartung.ts:243).
-- Quelle = geschaedigter-Party.ist_halter (semantisch: "Kunde ist Halter"). Converter setzt sie aus lead.ist_fahrzeughalter
--   (convert-lead-to-claim.ts:350) -> future-korrekt fuer NEUE Claims. 4 alte Seed-Rows divergieren (disposable, greenfield).
-- Rein additiv (1 Spalte + 1 Feld im kunde_p-LATERAL) -> CREATE OR REPLACE (Grants/anon-Revoke erhalten). baujahr bleibt int (Plan 4.2).
CREATE OR REPLACE VIEW public.v_claim_full AS
  SELECT c.id, c.vehicle_id, c.schadentag, c.schadenzeit, c.entdeckt_am, c.schadenort_adresse, c.schadenort_plz, c.schadenort_ort, c.schadenort_land, c.schadenort_lat, c.schadenort_lng, c.schadenort_kategorie, c.hergang_kunde_text, c.hergang_sv_text, c.schadenart, c.fall_typ, c.unfall_konstellation, c.fahrerflucht, c.auslandskennzeichen, c.polizei_aktenzeichen, c.polizei_bericht_vorhanden, c.polizei_vor_ort, c.polizeibericht_status, c.geschaedigter_user_id, c.gegnerisches_vehicle_id, c.gegner_versicherung_id, c.gegner_versicherungsnummer, c.gegner_aktenzeichen, c.gegner_bekannt, c.anzahl_beteiligte_total, c.hat_personenschaden, c.hat_mietwagen, c.hat_nutzungsausfall, c.hat_sachschaden, c.hat_abschleppung, c.sachschaden_beschreibung, c.halter_ungleich_fahrer, c.kunden_konstellation, c.unfallskizze_url, c.unfallskizze_svg, c.unfallskizze_bestaetigt, c.unfallskizze_ablehnung_grund, c.unfallskizze_generiert_am, c.status, c.abgeschlossen_am, c.verjaehrt_am, c.created_at, c.updated_at, c.created_by_user_id, c.created_via, c.claim_nummer, c.lead_id, c.kundenbetreuer_id, c.vs_ablehnungs_grund, c.regulierungs_betrag, c.endzustand_gesetzt_durch_user_id, c.endzustand_gesetzt_am, c.endzustand_grund, c.kanzlei_wunsch, c.kanzlei_wunsch_gefragt_am, c.kanzlei_wunsch_gefragt_in_phase,
    fcb.fall_id, c.sv_id, c.service_typ, c.operative_status::fall_status AS fall_status, fcb.fall_created_at,
    COALESCE((SELECT cr.last_activity_at FROM claim_recency cr WHERE cr.claim_id = c.id), c.created_at) AS fall_updated_at,
    c.kundenbetreuer_fallback_flag, c.szenario, c.dokumente_vollstaendig_fuer_phase, c.dokumente_reminder_whatsapp_letzte_sendung,
    spd_termin.no_show_gemeldet_am, spd_termin.re_termin_token, c.sa_unterschrieben_am, c.vollmacht_signiert_am, kf.mandatsnummer, spd_termin.re_termin_token_eingelaufen_am, spd_termin.re_termin_eskalation_an_kb_am, cur_auftrag.storniert_am, kf.anschlussschreiben_am,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    veh.kennzeichen_aktuell::text AS kennzeichen, veh.hersteller AS fahrzeug_hersteller, veh.modell_haupttyp AS fahrzeug_modell, veh.bauart AS fahrzeug_typ,
    c.sa_unterschrieben, kf.regulierung_am, c.regulierungs_betrag AS regulierung_betrag,
    g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag, g.fertiggestellt_am AS gutachten_eingegangen_am,
    c.sv_zugewiesen_am, c.schadens_ursache, c.schadenort_plz::text AS schadens_plz, c.schadenort_ort AS schadens_ort, c.fall_typ AS schadens_fall_typ,
    NULL::integer AS gegner_anzahl_beteiligte,
    COALESCE(gveh.bauart, gp.fahrzeugtyp_klartext) AS gegner_fahrzeugtyp,
    NULL::uuid AS organisation_id, NULL::uuid AS dispatch_id,
    c.geschaedigter_user_id AS kunde_id, c.ist_aktiv, c.deaktiviert_grund, c.hat_vorschaeden,
    vv.anzahl AS vorschaden_anzahl, vv.letzter_datum AS vorschaden_letzter_datum,
    veh.cardentity_report -> 'typB'::text AS vorschaden_typ_b_bericht, veh.cardentity_letzter_pull AS cardentity_abfrage_am,
    spd_termin.besichtigungsort_adresse, spd_termin.besichtigungsort_lat, spd_termin.besichtigungsort_lng, spd_termin.besichtigungsort_notiz, spd_termin.besichtigungsort_place_id,
    COALESCE((SELECT jsonb_agg(to_jsonb(cp.*) || jsonb_build_object('vorname', p.vorname, 'nachname', p.nachname, 'adresse_strasse', p.adresse_strasse, 'adresse_plz', p.adresse_plz, 'adresse_ort', p.adresse_ort, 'telefon', p.telefon, 'email', p.email, 'geburtsdatum', p.geburtsdatum, 'person', to_jsonb(p.*)) ORDER BY cp.reihenfolge, cp.created_at) FROM claim_parties cp LEFT JOIN personen p ON p.id = cp.person_id WHERE cp.claim_id = c.id), '[]'::jsonb) AS parties,
    COALESCE((SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at) FROM claim_vehicle_involvements cvi WHERE cvi.claim_id = c.id), '[]'::jsonb) AS vehicle_involvements,
    COALESCE((SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at) FROM claim_payments cp2 WHERE cp2.claim_id = c.id), '[]'::jsonb) AS payments,
    COALESCE((SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at) FROM claim_mietwagen cm WHERE cm.claim_id = c.id), '[]'::jsonb) AS mietwagen,
    COALESCE((SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum) FROM vs_korrespondenz vk WHERE vk.claim_id = c.id), '[]'::jsonb) AS vs_korrespondenz,
    COALESCE((SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at) FROM repairs r WHERE r.claim_id = c.id), '[]'::jsonb) AS repairs,
    vcp.main_phase, vcp.sub_phase,
    halter_p.vorname AS halter_vorname, halter_p.nachname AS halter_nachname, halter_p.adresse_strasse AS halter_strasse, halter_p.adresse_plz AS halter_plz, halter_p.adresse_ort AS halter_stadt, halter_p.telefon AS halter_telefon, halter_p.email AS halter_email, halter_p.geburtsdatum AS halter_geburtsdatum,
    NULLIF(TRIM(BOTH FROM (COALESCE(halter_p.vorname, ''::text) || ' '::text) || COALESCE(halter_p.nachname, ''::text)), ''::text) AS halter_name,
    COALESCE(gf.name, NULLIF(TRIM(BOTH FROM (COALESCE(gpp.vorname, ''::text) || ' '::text) || COALESCE(gpp.nachname, ''::text)), ''::text), gp.nachname) AS gegner_name,
    gv.name AS gegner_versicherung_name,
    COALESCE(gveh.kennzeichen_aktuell, gp.kennzeichen)::text AS gegner_kennzeichen,
    veh.fin AS fin_vin, veh.farbcode AS lackfarbe_code, EXTRACT(YEAR FROM veh.baujahr_monat)::integer AS fahrzeug_baujahr, veh.farbe_klartext AS fahrzeug_farbe, veh.fahrzeug_ausstattung, veh.hsn, veh.tsn, veh.aktueller_kilometerstand AS kilometerstand, veh.erstzulassung, veh.kennzeichen_buchstaben, veh.fin_quelle, veh.fin_extrahiert_am, c.vorschaden_erkannt,
    c.notizen, c.zeugen_kontakte, c.kunde_email, c.vorsteuerabzugsberechtigt,
    kunde_p.vorname AS kunde_vorname, kunde_p.nachname AS kunde_nachname, kunde_p.telefon AS kunde_telefon, kunde_p.strasse AS kunde_strasse, kunde_p.plz AS kunde_plz, kunde_p.ort AS kunde_stadt, kunde_p.firma_name AS firma_name,
    kunde_p.ist_fahrzeughalter
  FROM claims c
    LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id
    LEFT JOIN LATERAL (SELECT pe.vorname, pe.nachname, pe.adresse_strasse, pe.adresse_plz, pe.adresse_ort, pe.telefon, pe.email, pe.geburtsdatum FROM claim_parties hp LEFT JOIN personen pe ON pe.id = hp.person_id WHERE hp.claim_id = c.id AND hp.ist_halter = true ORDER BY hp.reihenfolge, hp.created_at LIMIT 1) halter_p ON true
    LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
    LEFT JOIN gutachten g ON g.claim_id = c.id
    LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
    LEFT JOIN LATERAL (SELECT a.storniert_am FROM auftraege a WHERE a.claim_id = c.id ORDER BY a.reihenfolge DESC LIMIT 1) cur_auftrag ON true
    LEFT JOIN LATERAL (SELECT gt.besichtigungsort_adresse, gt.besichtigungsort_lat, gt.besichtigungsort_lng, gt.besichtigungsort_notiz, gt.besichtigungsort_place_id, gt.no_show_gemeldet_am, gt.re_termin_token, gt.re_termin_token_eingelaufen_am, gt.re_termin_eskalation_an_kb_am FROM gutachter_termine gt WHERE gt.claim_id = c.id ORDER BY gt.start_zeit DESC NULLS LAST LIMIT 1) spd_termin ON true
    LEFT JOIN LATERAL (SELECT NULLIF(count(*), 0)::integer AS anzahl, max(vv0.schaden_datum) AS letzter_datum FROM vehicle_vorschaeden vv0 WHERE vv0.vehicle_id = c.vehicle_id) vv ON true
    LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id
    LEFT JOIN LATERAL (SELECT vp.firma_id, vp.person_id, vp.vehicle_id, vp.vorname, vp.nachname, vp.fahrzeugtyp_klartext, vp.kennzeichen FROM claim_parties vp WHERE vp.claim_id = c.id AND vp.rolle = 'verursacher' ORDER BY vp.reihenfolge, vp.created_at LIMIT 1) gp ON true
    LEFT JOIN firmen gf ON gf.id = gp.firma_id
    LEFT JOIN personen gpp ON gpp.id = gp.person_id
    LEFT JOIN versicherungen gv ON gv.id = c.gegner_versicherung_id
    LEFT JOIN vehicles gveh ON gveh.id = gp.vehicle_id
    LEFT JOIN LATERAL (SELECT COALESCE(kpe.vorname, kcp.vorname) AS vorname, COALESCE(kpe.nachname, kcp.nachname) AS nachname, COALESCE(kpe.telefon, kcp.telefon, kcp.mobil) AS telefon, COALESCE(kpe.adresse_strasse, kcp.adresse_strasse) AS strasse, COALESCE(kpe.adresse_plz, kcp.adresse_plz) AS plz, COALESCE(kpe.adresse_ort, kcp.adresse_ort) AS ort, COALESCE(kfi.name, kcp.firma, kpe.firma) AS firma_name, kcp.ist_halter AS ist_fahrzeughalter FROM claim_parties kcp LEFT JOIN personen kpe ON kpe.id = kcp.person_id LEFT JOIN firmen kfi ON kfi.id = kcp.firma_id WHERE kcp.claim_id = c.id AND kcp.rolle = 'geschaedigter' ORDER BY kcp.reihenfolge, kcp.created_at LIMIT 1) kunde_p ON true;
REVOKE ALL ON public.v_claim_full FROM PUBLIC;
REVOKE ALL ON public.v_claim_full FROM anon;
GRANT ALL ON public.v_claim_full TO authenticated;
GRANT ALL ON public.v_claim_full TO service_role;
