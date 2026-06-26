-- Phase 2a: v_claim_base um die vfmat-spezifischen Felder erweitern (additiv-append).
-- Die ersten 159 Spalten + alle LATERALs bleiben unveraendert (vcf-Layer unberuehrt,
-- fingerprint-verifiziert); spd_termin + cur_auftrag LATERALs werden verbreitert (mehr
-- Felder), SELECT bekommt die appended kanonischen Felder + fahrzeug_hersteller_raw
-- (vfmat nutzt raw veh.hersteller; base behaelt NULLIF'd fahrzeug_hersteller fuer vcf).
CREATE OR REPLACE VIEW public.v_claim_base AS
 SELECT c.id,
    c.vehicle_id, c.schadentag, c.schadenzeit, c.entdeckt_am, c.schadenort_adresse, c.schadenort_plz,
    c.schadenort_ort, c.schadenort_land, c.schadenort_lat, c.schadenort_lng, c.schadenort_kategorie,
    c.hergang_kunde_text, c.hergang_sv_text, c.schadenart, c.fall_typ, c.unfall_konstellation,
    c.fahrerflucht, c.auslandskennzeichen, c.polizei_aktenzeichen, c.polizei_bericht_vorhanden,
    c.polizei_vor_ort, c.polizeibericht_status, c.geschaedigter_user_id, c.gegnerisches_vehicle_id,
    c.gegner_versicherung_id, gp.versicherungsnummer AS gegner_versicherungsnummer,
    gp.versicherungs_aktenzeichen AS gegner_aktenzeichen, c.gegner_bekannt, c.anzahl_beteiligte_total,
    c.hat_personenschaden, c.hat_mietwagen, c.hat_nutzungsausfall, c.hat_sachschaden, c.hat_abschleppung,
    c.sachschaden_beschreibung, c.halter_ungleich_fahrer, c.kunden_konstellation, c.unfallskizze_url,
    c.unfallskizze_svg, c.unfallskizze_bestaetigt, c.unfallskizze_ablehnung_grund, c.unfallskizze_generiert_am,
    c.status, c.abgeschlossen_am, c.verjaehrt_am, c.created_at, c.updated_at, c.created_by_user_id,
    c.created_via, c.claim_nummer, c.lead_id, c.kundenbetreuer_id, c.vs_ablehnungs_grund, c.regulierungs_betrag,
    c.endzustand_gesetzt_durch_user_id, c.endzustand_gesetzt_am, c.endzustand_grund, c.kanzlei_wunsch,
    c.kanzlei_wunsch_gefragt_am, c.kanzlei_wunsch_gefragt_in_phase, fcb.fall_id, c.sv_id, c.service_typ,
    c.operative_status::fall_status AS fall_status, fcb.fall_created_at,
    COALESCE(( SELECT cr.last_activity_at FROM claim_recency cr WHERE cr.claim_id = c.id), c.created_at) AS fall_updated_at,
    c.kundenbetreuer_fallback_flag, c.szenario, c.dokumente_vollstaendig_fuer_phase,
    c.dokumente_reminder_whatsapp_letzte_sendung, spd_termin.no_show_gemeldet_am, spd_termin.re_termin_token,
    c.sa_unterschrieben_am, c.vollmacht_signiert_am, kf.mandatsnummer, spd_termin.re_termin_token_eingelaufen_am,
    spd_termin.re_termin_eskalation_an_kb_am, cur_auftrag.storniert_am, kf.anschlussschreiben_am,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    veh.kennzeichen_aktuell::text AS kennzeichen, NULLIF(veh.hersteller, 'Unbekannt'::text) AS fahrzeug_hersteller,
    veh.modell_haupttyp AS fahrzeug_modell, veh.bauart AS fahrzeug_typ, c.sa_unterschrieben, kf.regulierung_am,
    c.regulierungs_betrag AS regulierung_betrag, g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag,
    g.fertiggestellt_am AS gutachten_eingegangen_am, c.sv_zugewiesen_am, c.schadens_ursache,
    c.schadenort_plz::text AS schadens_plz, c.schadenort_ort AS schadens_ort, c.fall_typ AS schadens_fall_typ,
    c.anzahl_beteiligte_total - 1 AS gegner_anzahl_beteiligte,
    COALESCE(gveh.bauart, gp.fahrzeugtyp_klartext) AS gegner_fahrzeugtyp, NULL::uuid AS organisation_id,
    NULL::uuid AS dispatch_id, c.geschaedigter_user_id AS kunde_id, c.ist_aktiv, c.deaktiviert_grund,
    c.hat_vorschaeden, vv.anzahl AS vorschaden_anzahl, vv.letzter_datum AS vorschaden_letzter_datum,
    veh.cardentity_report -> 'typB'::text AS vorschaden_typ_b_bericht, veh.cardentity_letzter_pull AS cardentity_abfrage_am,
    spd_termin.besichtigungsort_adresse, spd_termin.besichtigungsort_lat, spd_termin.besichtigungsort_lng,
    spd_termin.besichtigungsort_notiz, spd_termin.besichtigungsort_place_id, vcp.main_phase, vcp.sub_phase,
    halter_p.vorname AS halter_vorname, halter_p.nachname AS halter_nachname, halter_p.adresse_strasse AS halter_strasse,
    halter_p.adresse_plz AS halter_plz, halter_p.adresse_ort AS halter_stadt, halter_p.telefon AS halter_telefon,
    halter_p.email AS halter_email, halter_p.geburtsdatum AS halter_geburtsdatum,
    NULLIF(TRIM(BOTH FROM (COALESCE(halter_p.vorname, ''::text) || ' '::text) || COALESCE(halter_p.nachname, ''::text)), ''::text) AS halter_name,
    COALESCE(gf.name, NULLIF(TRIM(BOTH FROM (COALESCE(gpp.vorname, ''::text) || ' '::text) || COALESCE(gpp.nachname, ''::text)), ''::text)) AS gegner_name,
    gv.name AS gegner_versicherung_name, COALESCE(gveh.kennzeichen_aktuell, gp.kennzeichen)::text AS gegner_kennzeichen,
    veh.fin AS fin_vin, veh.farbcode AS lackfarbe_code, EXTRACT(year FROM veh.baujahr_monat)::integer AS fahrzeug_baujahr,
    veh.farbe_klartext AS fahrzeug_farbe, veh.fahrzeug_ausstattung, veh.hsn, veh.tsn,
    veh.aktueller_kilometerstand AS kilometerstand, veh.erstzulassung, veh.kennzeichen_buchstaben, veh.fin_quelle,
    veh.fin_extrahiert_am, c.vorschaden_erkannt, c.notizen, c.zeugen_kontakte, kunde_p.email AS kunde_email,
    c.vorsteuerabzugsberechtigt, kunde_p.vorname AS kunde_vorname, kunde_p.nachname AS kunde_nachname,
    kunde_p.telefon AS kunde_telefon, kunde_p.strasse AS kunde_strasse, kunde_p.plz AS kunde_plz,
    kunde_p.ort AS kunde_stadt, kunde_p.firma_name, kunde_p.ist_fahrzeughalter, c.fahrzeug_fahrbereit,
    c.fahrzeugschaden_beschreibung, veh.aufbau AS fahrzeug_aufbau,
    COALESCE(gv.name, gp.versicherung_klartext) AS gegner_versicherung, c.operative_status, c.spezifikation,
    c.zeugen_vorhanden, c.sprache,
    c.betreuungspaket, c.abtretung_pdf, c.vollmacht_pdf, c.abtretung_signiert_am, c.kanzlei_uebergeben_am,
    cur_auftrag.filmcheck_ok, cur_auftrag.filmcheck_am, cur_auftrag.filmcheck_notizen,
    c.gewerbe_flag, c.leasinggeber_name, c.leasinggeber_informiert, c.prioritaet, c.onboarding_complete,
    c.konvertiert_am, c.status_changed_at, kf.regulierung_angekuendigt_am, c.google_review_gesendet,
    c.vorschaden_geprueft, veh.cardentity_report -> 'typA'::text AS vorschaden_typ_a_ergebnis,
    veh.cardentity_report ->> 'pdfUrl'::text AS vorschaden_typ_b_pdf_url, c.schadens_hoehe_netto,
    g.gutachten_nutzungsausfall_tagessatz_eur::numeric(10,2) AS nutzungsausfall_tagessatz,
    g.wiederbeschaffungsdauer_tage AS reparaturdauer_tage, g.gutachten_sv_honorar_netto AS gutachter_honorar,
    g.ocr_finished_at AS ocr_extrahiert_am, g.gutachten_ocr_raw AS ocr_rohdaten, g.ki_kalkulation, c.kanzlei_honorar,
    g.ki_kalkulation_am, g.ki_geschaetzte_kosten_min::numeric(10,2) AS ki_geschaetzte_kosten_min,
    g.ki_geschaetzte_kosten_max::numeric(10,2) AS ki_geschaetzte_kosten_max,
    c.kanzlei_ansprechpartner_name, c.kanzlei_ansprechpartner_email, c.kanzlei_ansprechpartner_telefon,
    c.kanzlei_ansprechpartner_position, spd_termin.losfahren_erinnerung_gesendet, spd_termin.termin_erinnerung_5min_gesendet,
    spd_termin.geschaetzte_fahrtzeit_min AS geschaetzte_fahrzeit_min, spd_termin.geschaetzte_fahrdistanz_km,
    spd_termin.google_event_id AS gcal_event_id, g.id IS NOT NULL AS gutachten_vorhanden,
    g.pdf_uploaded_at AS gutachten_hochgeladen_am, g.positionen AS gutachten_positionen,
    g.auftragsnummer AS gutachten_nummer, g.reparaturkosten_netto AS reparaturkosten, g.minderwert AS wertminderung,
    (g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage::numeric)::numeric(10,2) AS nutzungsausfall_gesamt,
    kf.regulierungsweise, c.sa_pdf_url, c.sa_unterschrift_url, c.datenschutz_akzeptiert, c.datenschutz_akzeptiert_am, c.vollmacht_status,
    c.unfallmitteilung_status, c.interne_notizen, kf.anschlussschreiben_url, kf.anschlussschreiben_sendedatum,
    COALESCE(kf.anschlussschreiben_unterschrift, false) AS anschlussschreiben_unterschrift, kf.anschlussschreiben_ocr_am,
    c.deaktiviert_am, c.deaktiviert_notiz, kf.ruege_erhalten_am, kf.ruege_grund, c.marketing_quelle,
    c.marketing_provision, c.marketing_provision_status, kf.kanzlei_id, c.lead_preis_netto, c.lead_preis_typ,
    c.lead_preis_berechnet_am, c.guthaben_verrechnet_netto, c.sv_nachzahlung_netto, c.abrechnung_id,
    cur_auftrag.storno_grund, cur_auftrag.storno_durch_user_id, c.schadenart AS schadens_art,
    c.dokumente_vollstaendig_am_phase, c.kanzlei_abrechnung_id, c.kanzlei_provision_status,
    c.kanzlei_provision_ausgezahlt_am, kf.vs_reaktion_typ, kf.vs_reaktion_am,
    c.vs_ablehnungs_grund AS vs_ablehnungsgrund, kf.ruege_gesendet_am, kf.ruege_betrag,
    c.kunde_no_show_count AS no_show_count, kf.kuerzungs_betrag, kf.vs_frist_bis,
    COALESCE(kf.ruege_counter, 0) AS ruege_counter, c.schlussabrechnung_am, c.iban, c.bic, c.kontoinhaber,
    c.bankdaten_hinterlegt_am, c.finanzierung_leasing, c.finanzierungsgeber_name, c.finanzierungsgeber_adresse,
    c.finanzierungsgeber_vertragsnr, c.zahlungsweg, c.vorschaeden_beschreibung,
    cur_auftrag.technische_stellungnahme_status, cur_auftrag.technische_stellungnahme_beauftragt_am,
    cur_auftrag.technische_stellungnahme_hochgeladen_am, cur_auftrag.technische_stellungnahme_freigabe_am,
    spd_termin.nachbesichtigung_status, spd_termin.nachbesichtigung_angefordert_am, spd_termin.nachbesichtigung_termin_datum,
    spd_termin.nachbesichtigung_konfrontation, kf.as_geforderte_summe, kf.as_frist, kf.as_vs_reaktion_text,
    kf.as_salesforce_id, kf.as_zuletzt_synced_am, kf.lexdrive_case_id, kf.eskalation_tag_14_am,
    kf.eskalation_tag_21_am, kf.eskalation_tag_28_am, veh.cardentity_letzter_pull AS cardentity_enriched_at,
    veh.cardentity_report, c.vollmacht_geprueft_am, c.vollmacht_geprueft_von, c.vollmacht_pruefung_status,
    c.vollmacht_pruefung_begruendung, kf.lexdrive_ocr_data, kf.lexdrive_ocr_received_at, kf.vs_kuerzung_grund,
    c.geschlossen_grund, spd_termin.nachbesichtigung_ergebnis, c.bevorzugter_kanal, c.werkstatt_seit_datum,
    c.hat_nutzungsausfall AS nutzungsausfall, c.mietwagen_kanzlei_informiert, c.mietwagen_kanzlei_informiert_am,
    c.abrechnungsart_besprochen, c.abrechnungsart_notiz, c.abrechnungsart_besprochen_am,
    c.kundenbetreuer_zugewiesen_am, cur_auftrag.sv_briefing_text, cur_auftrag.sv_briefing_generated_at,
    cur_auftrag.sv_briefing_model, cur_auftrag.sv_briefing_version, cur_auftrag.sv_briefing_struktur,
    cur_auftrag.sv_notizen_vor_ort, c.makler_id, gp.versicherungs_aktenzeichen AS gegner_schadennummer,
    spd_termin.wunschtermin, kf.vs_quote_prozent, kf.vs_quote_grund, kf.vs_quote_akzeptiert_am, kf.vs_quote_betrag_ausgezahlt,
    kf.vs_kuerzungs_typ, c.auszahlung_gutachter_eingegangen_am, c.auszahlung_zahlungsweg,
    kf.eskalation_tag_14_ergebnis, kf.eskalation_tag_14_ergebnis_am, kf.eskalation_tag_14_ergebnis_von,
    kf.eskalation_tag_21_ergebnis, kf.eskalation_tag_21_ergebnis_am, kf.eskalation_tag_21_ergebnis_von,
    kf.eskalation_tag_28_ergebnis, kf.eskalation_tag_28_ergebnis_am, kf.eskalation_tag_28_ergebnis_von,
    spd_termin.nachbesichtigung_kunde_termin_vorschlaege, spd_termin.nachbesichtigung_kunde_termin_eingereicht_am,
    spd_termin.nachbesichtigung_sv_konfrontation_gewuenscht, spd_termin.nachbesichtigung_sv_termin_vereinbart_am,
    c.auszahlung_gutachter_betrag, COALESCE(kf.ruege_frist_tage, 14) AS ruege_frist_tage, kf.klage_uebergeben_am,
    c.fallakte_angelegt_am, kunde_p.strasse AS kunde_adresse, c.kunde_lat, c.kunde_lng,
    cur_auftrag.technische_stellungnahme_notiz_sv, c.zb1_status, c.schadenzeit::text AS unfall_uhrzeit,
    c.schadenort_lat::numeric AS unfallort_lat, c.schadenort_lng::numeric AS unfallort_lng, c.bkat_unfallart,
    c.hat_mietwagen AS mietwagen_hat, c.mietwagen_seit_datum, c.mietwagen_limit_tage, c.mietwagen_limit_grund,
    c.mietwagen_rechnung_vorhanden, c.mietwagen_rechnung_url, c.mietwagen_argumentations_puffer, c.mietwagen_vermieter,
    spd_termin.id AS aktueller_termin_id, spd_termin.start_zeit AS aktueller_termin_start, spd_termin.end_zeit AS aktueller_termin_end,
    spd_termin.status AS aktueller_termin_status, spd_termin.sv_id AS aktueller_termin_sv_id, spd_termin.kanal AS aktueller_termin_kanal,
    spd_termin.typ AS aktueller_termin_typ, spd_termin.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab,
    spd_termin.start_zeit AS sv_termin, spd_termin.status AS gutachter_termin_status,
    spd_termin.status = 'bestaetigt'::text AS gutachter_termin_bestaetigt, spd_termin.vorgeschlagenes_datum AS gutachter_gegenvorschlag_datum,
    spd_termin.gegenvorschlag_grund AS gutachter_gegenvorschlag_grund,
    c.hat_personenschaden AS personenschaden_flag, c.hat_mietwagen AS mietwagen_flag,
    c.halter_ungleich_fahrer AS halter_ungleich_fahrer_flag, c.hat_sachschaden AS sachschaden_flag,
    c.id AS claim_id, spd_termin.sv_termin_dokument_reminder_gesendet_am,
    c.schadenort_kategorie AS unfallort_kategorie,
    veh.hersteller AS fahrzeug_hersteller_raw
   FROM claims c
     LEFT JOIN faelle_claim_bridge fcb ON fcb.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT pe.vorname, pe.nachname, pe.adresse_strasse, pe.adresse_plz, pe.adresse_ort,
            pe.telefon, pe.email, pe.geburtsdatum
           FROM claim_parties hp LEFT JOIN personen pe ON pe.id = hp.person_id
          WHERE hp.claim_id = c.id AND hp.ist_halter = true
          ORDER BY hp.reihenfolge, hp.created_at LIMIT 1) halter_p ON true
     LEFT JOIN vehicles veh ON veh.id = c.vehicle_id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT a.storniert_am, a.filmcheck_ok, a.filmcheck_am, a.filmcheck_notizen, a.storno_grund,
            a.storno_durch_user_id, a.sv_briefing_text, a.sv_briefing_generated_at, a.sv_briefing_model,
            a.sv_briefing_version, a.sv_briefing_struktur, a.sv_notizen_vor_ort, a.technische_stellungnahme_status,
            a.technische_stellungnahme_notiz_sv, a.technische_stellungnahme_beauftragt_am,
            a.technische_stellungnahme_hochgeladen_am, a.technische_stellungnahme_freigabe_am
           FROM auftraege a WHERE a.claim_id = c.id ORDER BY a.reihenfolge DESC LIMIT 1) cur_auftrag ON true
     LEFT JOIN LATERAL ( SELECT gt.id, gt.start_zeit, gt.end_zeit, gt.status, gt.kanal, gt.typ,
            gt.final_verbindlich_ab, gt.vorgeschlagenes_datum, gt.gegenvorschlag_grund, gt.wunschtermin,
            gt.google_event_id, gt.geschaetzte_fahrtzeit_min, gt.geschaetzte_fahrdistanz_km,
            gt.losfahren_erinnerung_gesendet, gt.termin_erinnerung_5min_gesendet,
            gt.sv_termin_dokument_reminder_gesendet_am, gt.no_show_gemeldet_am,
            gt.besichtigungsort_adresse, gt.besichtigungsort_lat, gt.besichtigungsort_lng,
            gt.besichtigungsort_notiz, gt.besichtigungsort_place_id, gt.re_termin_token,
            gt.re_termin_token_eingelaufen_am, gt.re_termin_eskalation_an_kb_am, NULL::uuid AS sv_id,
            gt.nachbesichtigung_status, gt.nachbesichtigung_angefordert_am, gt.nachbesichtigung_termin_datum,
            gt.nachbesichtigung_konfrontation, gt.nachbesichtigung_ergebnis,
            gt.nachbesichtigung_kunde_termin_vorschlaege, gt.nachbesichtigung_kunde_termin_eingereicht_am,
            gt.nachbesichtigung_sv_konfrontation_gewuenscht, gt.nachbesichtigung_sv_termin_vereinbart_am
           FROM gutachter_termine gt WHERE gt.id = get_aktueller_gt_termin_id(c.id)) spd_termin ON true
     LEFT JOIN LATERAL ( SELECT NULLIF(count(*), 0)::integer AS anzahl, max(vv0.schaden_datum) AS letzter_datum
           FROM vehicle_vorschaeden vv0 WHERE vv0.vehicle_id = c.vehicle_id) vv ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT vp.firma_id, vp.versicherungsnummer, vp.versicherungs_aktenzeichen, vp.person_id,
            vp.vehicle_id, vp.fahrzeugtyp_klartext, vp.kennzeichen, vp.versicherung_klartext
           FROM claim_parties vp WHERE vp.claim_id = c.id AND vp.rolle = 'verursacher'::text
          ORDER BY vp.reihenfolge, vp.created_at LIMIT 1) gp ON true
     LEFT JOIN firmen gf ON gf.id = gp.firma_id
     LEFT JOIN personen gpp ON gpp.id = gp.person_id
     LEFT JOIN versicherungen gv ON gv.id = c.gegner_versicherung_id
     LEFT JOIN vehicles gveh ON gveh.id = gp.vehicle_id
     LEFT JOIN LATERAL ( SELECT kpe.vorname, kpe.email, kpe.nachname, COALESCE(kpe.telefon, kpe.mobil) AS telefon,
            kpe.adresse_strasse AS strasse, kpe.adresse_plz AS plz, kpe.adresse_ort AS ort,
            COALESCE(kfi.name, kpe.firma) AS firma_name, kcp.ist_halter AS ist_fahrzeughalter
           FROM claim_parties kcp LEFT JOIN personen kpe ON kpe.id = kcp.person_id
             LEFT JOIN firmen kfi ON kfi.id = kcp.firma_id
          WHERE kcp.claim_id = c.id AND kcp.rolle = 'geschaedigter'::text
          ORDER BY kcp.reihenfolge, kcp.created_at LIMIT 1) kunde_p ON true;