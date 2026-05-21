-- CMM-44 SP-G2 PR2 — gutachter_termine.claim_id faelle-entkoppeln.
--
-- Block 0: Catch-up-Backfill (Sicherheitsnetz, liest faelle einmalig; pre-launch 0 Rows).
-- Block 1: CMM-58 Ableitungs-Trigger + Funktion droppen (las faelle).
-- Block 2: Validierungs-Trigger — RAISE nur bei fall_id gesetzt + claim_id NULL,
--          Scope OF fall_id, claim_id (feuert nicht bei Status-/Reminder-Updates), liest faelle NICHT.
-- Block 3a: v_faelle_mit_aktuellem_termin — LATERAL Termin-Join gt.fall_id -> gt.claim_id.
-- Block 3b: v_claim_timeline — NUR der Termin-UNION-Branch: f.claim_id -> gt.claim_id, JOIN faelle weg.
--
-- View-Defs aus live pg_get_viewdef (2026-05-21) uebernommen, je genau die Termin-Kopplung geaendert.
-- Nach Apply: npx supabase migration repair --status applied <timestamp>
-- Ticket: CMM-44 / Sub-Projekt SP-G2 / Plan Task 4-5 / Spec 3.3/3.4
-- WICHTIG (Apply-Gate): erst applizieren wenn PR1-Writer-Code auf PROD laeuft (geteilte DB).

BEGIN;

-- ============================================================
-- Block 0: Catch-up
-- ============================================================
UPDATE public.gutachter_termine gt
SET claim_id = f.claim_id
FROM public.faelle f
WHERE gt.fall_id = f.id AND gt.claim_id IS NULL AND f.claim_id IS NOT NULL;

-- ============================================================
-- Block 1: CMM-58 Ableitungs-Trigger + Funktion entfernen
-- ============================================================
DROP TRIGGER IF EXISTS trg_sync_gutachter_termine_claim_id ON public.gutachter_termine;
DROP FUNCTION IF EXISTS public.sync_gutachter_termine_claim_id();

-- ============================================================
-- Block 2: Validierungs-Trigger (fail-loud, liest faelle NICHT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_gutachter_termine_claim_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.fall_id IS NOT NULL AND NEW.claim_id IS NULL THEN
    RAISE EXCEPTION 'gutachter_termine.claim_id darf nicht NULL sein wenn fall_id gesetzt ist (fall_id=%). CMM-44 SP-G2: der Writer muss claim_id setzen.', NEW.fall_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_gutachter_termine_claim_id ON public.gutachter_termine;
CREATE TRIGGER trg_validate_gutachter_termine_claim_id
  BEFORE INSERT OR UPDATE OF fall_id, claim_id ON public.gutachter_termine
  FOR EACH ROW EXECUTE FUNCTION public.validate_gutachter_termine_claim_id();

-- ============================================================
-- Block 3a: v_faelle_mit_aktuellem_termin (LATERAL gt.fall_id -> gt.claim_id)
-- ============================================================
CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS
 SELECT f.id,
    f.lead_id,
    f.kunde_id,
    f.status,
    c.betreuungspaket,
    c.hergang_kunde_text AS schadens_beschreibung,
    c.schadentag AS schadens_datum,
    c.entdeckt_am AS schadens_entdeckt_am,
    c.schadenort_adresse AS schadens_adresse,
    c.schadenort_plz::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    c.abtretung_pdf,
    c.vollmacht_pdf,
    c.abtretung_signiert_am,
    c.vollmacht_signiert_am,
    f.sv_id,
    c.sv_zugewiesen_am,
    g.fertiggestellt_am AS gutachten_eingegangen_am,
    g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag,
    c.kanzlei_uebergeben_am,
    f.anschlussschreiben_am,
    c.regulierungs_betrag AS regulierung_betrag,
    f.regulierung_am,
    cur_auftrag.filmcheck_ok,
    cur_auftrag.filmcheck_am,
    cur_auftrag.filmcheck_notizen,
    c.notizen,
    f.created_at,
    f.updated_at,
    c.fall_typ AS schadens_fall_typ,
    c.kunden_konstellation,
    f.kennzeichen,
    f.fahrzeug_typ,
    f.fahrzeug_hersteller,
    f.fahrzeug_modell,
    f.fahrzeug_baujahr,
    f.gegner_name,
    f.gegner_versicherung,
    f.gegner_kennzeichen,
    c.gegner_bekannt,
    c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden,
    c.hat_personenschaden AS personenschaden_flag,
    c.hat_mietwagen AS mietwagen_flag,
    c.gewerbe_flag,
    c.halter_ungleich_fahrer AS halter_ungleich_fahrer_flag,
    f.ust_id,
    f.leasinggeber_name,
    c.leasinggeber_informiert,
    f.bank_name,
    c.prioritaet,
    c.onboarding_complete,
    f.dispatch_id,
    c.kundenbetreuer_id,
    f.konvertiert_am,
    c.lead_id AS konvertiert_von_lead,
    c.status_changed_at,
    f.regulierung_angekuendigt_am,
    f.zahlung_eingegangen_am,
    c.abgeschlossen_am,
    c.google_review_gesendet,
    f.vs_eskalationsstufe,
    f.fin_quelle,
    f.fin_extrahiert_am,
    f.vorschaden_geprueft,
    f.vorschaden_anzahl,
    f.vorschaden_letzter_datum,
    f.vorschaden_typ_a_ergebnis,
    f.vorschaden_typ_b_bericht,
    f.vorschaden_typ_b_pdf_url,
    f.cardentity_abfrage_am,
    c.schadens_hoehe_netto,
    g.gutachten_nutzungsausfall_tagessatz_eur::numeric(10,2) AS nutzungsausfall_tagessatz,
    g.wiederbeschaffungsdauer_tage AS reparaturdauer_tage,
    g.gutachten_sv_honorar_netto AS gutachter_honorar,
    g.ocr_finished_at AS ocr_extrahiert_am,
    g.gutachten_ocr_raw AS ocr_rohdaten,
    g.ki_kalkulation,
    g.ki_kalkulation_am,
    g.ki_geschaetzte_kosten_min::numeric(10,2) AS ki_geschaetzte_kosten_min,
    g.ki_geschaetzte_kosten_max::numeric(10,2) AS ki_geschaetzte_kosten_max,
    c.kanzlei_ansprechpartner_name,
    c.kanzlei_ansprechpartner_email,
    c.kanzlei_ansprechpartner_telefon,
    c.kanzlei_ansprechpartner_position,
    f.mandatsnummer,
    f.losfahren_erinnerung_gesendet,
    f.termin_erinnerung_5min_gesendet,
    f.geschaetzte_fahrzeit_min,
    f.geschaetzte_fahrdistanz_km,
    f.gcal_event_id,
    g.id IS NOT NULL AS gutachten_vorhanden,
    g.pdf_uploaded_at AS gutachten_hochgeladen_am,
    g.positionen AS gutachten_positionen,
    g.auftragsnummer AS gutachten_nummer,
    g.reparaturkosten_netto AS reparaturkosten,
    g.minderwert AS wertminderung,
    (g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage::numeric)::numeric(10,2) AS nutzungsausfall_gesamt,
    f.regulierungsweise,
    c.gegner_versicherungsnummer,
    c.sa_unterschrieben,
    c.sa_unterschrieben_am,
    c.sa_pdf_url,
    c.sa_unterschrift_url,
    c.datenschutz_akzeptiert,
    c.datenschutz_akzeptiert_am,
    c.vollmacht_status,
    c.polizei_vor_ort,
    c.hergang_kunde_text AS unfallhergang,
    c.unfallmitteilung_status,
    c.schadenort_adresse AS unfallort,
    c.schadentag AS unfalldatum,
    c.interne_notizen,
    f.anschlussschreiben_url,
    f.anschlussschreiben_sendedatum,
    f.anschlussschreiben_unterschrift,
    f.anschlussschreiben_ocr_am,
    f.besichtigungsort_adresse,
    f.besichtigungsort_lat,
    f.besichtigungsort_lng,
    f.besichtigungsort_place_id,
    c.ist_aktiv,
    c.deaktiviert_am,
    c.deaktiviert_grund,
    c.deaktiviert_notiz,
    c.szenario,
    f.ruege_erhalten_am,
    f.ruege_grund,
    f.fahrzeug_farbe,
    f.erstzulassung,
    f.kilometerstand,
    f.firma_name,
    f.marketing_quelle,
    f.marketing_provision,
    f.marketing_provision_status,
    NULL::numeric(10,2) AS gutachten_stundensatz,
    f.kanzlei_id,
    f.kanzlei_honorar,
    f.zahlung_erwartet_am,
    f.zahlung_betrag,
    f.lead_preis_netto,
    f.lead_preis_typ,
    f.lead_preis_berechnet_am,
    f.guthaben_verrechnet_netto,
    f.sv_nachzahlung_netto,
    f.abrechnung_id,
    cur_auftrag.storniert_am,
    cur_auftrag.storno_grund,
    cur_auftrag.storno_durch_user_id,
    f.no_show_gemeldet_am,
    c.spezifikation,
    c.schadenart AS schadens_art,
    f.organisation_id,
    c.phase AS aktuelle_phase,
    c.dokumente_vollstaendig_fuer_phase,
    c.dokumente_vollstaendig_am_phase,
    c.unfall_konstellation,
    f.gegner_anzahl_beteiligte,
    f.gegner_fahrzeugtyp,
    c.dokumente_reminder_whatsapp_letzte_sendung,
    f.fin_vin,
    f.source_channel,
    f.source_domain,
    c.schadens_ursache,
    f.kanzlei_abrechnung_id,
    f.kanzlei_provision_status,
    f.kanzlei_provision_ausgezahlt_am,
    c.service_typ,
    f.vs_reaktion_typ,
    f.vs_reaktion_am,
    c.vs_ablehnungs_grund AS vs_ablehnungsgrund,
    f.ruege_gesendet_am,
    f.ruege_betrag,
    c.kunde_no_show_count AS no_show_count,
    f.kuerzungs_betrag,
    f.vs_frist_bis,
    f.ruege_counter,
    f.schlussabrechnung_am,
    f.iban,
    f.bic,
    f.kontoinhaber,
    f.bankdaten_hinterlegt_am,
    f.ist_fahrzeughalter,
    c.finanzierung_leasing,
    c.vorsteuerabzugsberechtigt,
    c.hergang_kunde_text AS schadens_hergang,
    f.halter_vorname,
    f.halter_nachname,
    f.halter_strasse,
    f.halter_plz,
    f.halter_stadt,
    f.halter_telefon,
    f.halter_email,
    c.finanzierungsgeber_name,
    c.finanzierungsgeber_adresse,
    c.finanzierungsgeber_vertragsnr,
    f.zahlungsweg,
    f.hat_vorschaeden,
    f.vorschaeden_beschreibung,
    cur_auftrag.technische_stellungnahme_status,
    cur_auftrag.technische_stellungnahme_beauftragt_am,
    cur_auftrag.technische_stellungnahme_hochgeladen_am,
    cur_auftrag.technische_stellungnahme_freigabe_am,
    f.nachbesichtigung_status,
    f.nachbesichtigung_angefordert_am,
    f.nachbesichtigung_termin_datum,
    f.nachbesichtigung_konfrontation,
    f.as_geforderte_summe,
    f.as_frist,
    f.as_vs_reaktion_text,
    f.as_salesforce_id,
    f.as_zuletzt_synced_am,
    f.lexdrive_case_id,
    f.eskalation_tag_14_am,
    f.eskalation_tag_21_am,
    f.eskalation_tag_28_am,
    c.schadenort_kategorie AS unfallort_kategorie,
    c.unfallskizze_url,
    f.fahrzeug_ausstattung,
    f.cardentity_enriched_at,
    f.cardentity_report,
    c.vollmacht_geprueft_am,
    c.vollmacht_geprueft_von,
    c.vollmacht_pruefung_status,
    c.vollmacht_pruefung_begruendung,
    f.lexdrive_ocr_data,
    f.lexdrive_ocr_received_at,
    f.vs_kuerzung_grund,
    c.geschlossen_grund,
    f.nachbesichtigung_ergebnis,
    c.bevorzugter_kanal,
    c.gegner_versicherung_id,
    c.zeugen_kontakte,
    c.werkstatt_seit_datum,
    c.fahrzeug_fahrbereit,
    c.hat_nutzungsausfall AS nutzungsausfall,
    f.mietwagen_kanzlei_informiert,
    f.mietwagen_kanzlei_informiert_am,
    f.halter_geburtsdatum,
    c.abrechnungsart_besprochen,
    c.abrechnungsart_notiz,
    c.abrechnungsart_besprochen_am,
    f.gegner_versicherung_anfrage_datum,
    c.sprache,
    c.unfallskizze_svg,
    c.unfallskizze_bestaetigt,
    c.unfallskizze_ablehnung_grund,
    c.unfallskizze_generiert_am,
    c.zeugen_vorhanden,
    f.vorschaden_erkannt,
    f.sv_termin_dokument_reminder_gesendet_am,
    c.kundenbetreuer_fallback_flag,
    c.kundenbetreuer_zugewiesen_am,
    cur_auftrag.sv_briefing_text,
    cur_auftrag.sv_briefing_generated_at,
    cur_auftrag.sv_briefing_model,
    cur_auftrag.sv_briefing_version,
    cur_auftrag.sv_briefing_struktur,
    cur_auftrag.sv_notizen_vor_ort,
    c.makler_id,
    c.hat_sachschaden AS sachschaden_flag,
    c.sachschaden_beschreibung,
    c.gegner_aktenzeichen AS gegner_schadennummer,
    f.halter_name,
    f.wunschtermin,
    f.vs_quote_prozent,
    f.vs_quote_grund,
    f.vs_quote_akzeptiert_am,
    f.vs_quote_betrag_ausgezahlt,
    f.vs_kuerzungs_typ,
    f.auszahlung_kunde_betrag,
    f.auszahlung_kunde_eingegangen_am,
    f.auszahlung_gutachter_eingegangen_am,
    f.auszahlung_zahlungsweg,
    f.eskalation_tag_14_ergebnis,
    f.eskalation_tag_14_ergebnis_am,
    f.eskalation_tag_14_ergebnis_von,
    f.eskalation_tag_21_ergebnis,
    f.eskalation_tag_21_ergebnis_am,
    f.eskalation_tag_21_ergebnis_von,
    f.eskalation_tag_28_ergebnis,
    f.eskalation_tag_28_ergebnis_am,
    f.eskalation_tag_28_ergebnis_von,
    f.nachbesichtigung_kunde_termin_vorschlaege,
    f.nachbesichtigung_kunde_termin_eingereicht_am,
    f.nachbesichtigung_sv_konfrontation_gewuenscht,
    f.nachbesichtigung_sv_termin_vereinbart_am,
    f.auszahlung_gutachter_betrag,
    f.ruege_frist_tage,
    f.klage_uebergeben_am,
    c.fallakte_angelegt_am,
    f.kunde_vorname,
    f.kunde_nachname,
    f.kunde_telefon,
    c.kunde_email,
    f.kunde_strasse,
    f.kunde_plz,
    f.kunde_stadt,
    f.kunde_adresse,
    f.kunde_lat,
    f.kunde_lng,
    f.hsn,
    f.tsn,
    cur_auftrag.technische_stellungnahme_notiz_sv,
    c.fahrerflucht,
    c.auslandskennzeichen,
    c.polizeibericht_status,
    c.zb1_status,
    c.schadenzeit::text AS unfall_uhrzeit,
    c.schadenort_lat::numeric AS unfallort_lat,
    c.schadenort_lng::numeric AS unfallort_lng,
    c.bkat_unfallart,
    c.fahrzeugschaden_beschreibung,
    c.hat_mietwagen AS mietwagen_hat,
    c.mietwagen_seit_datum,
    c.mietwagen_limit_tage,
    c.mietwagen_limit_grund,
    c.mietwagen_rechnung_vorhanden,
    c.mietwagen_rechnung_url,
    c.mietwagen_argumentations_puffer,
    c.mietwagen_vermieter,
    c.vehicle_id,
    f.claim_id,
    f.lackfarbe_code,
    t.id AS aktueller_termin_id,
    t.start_zeit AS aktueller_termin_start,
    t.end_zeit AS aktueller_termin_end,
    t.status AS aktueller_termin_status,
    t.sv_id AS aktueller_termin_sv_id,
    t.kanal AS aktueller_termin_kanal,
    t.typ AS aktueller_termin_typ,
    t.final_verbindlich_ab AS aktueller_termin_final_verbindlich_ab,
    t.start_zeit AS sv_termin,
    t.status AS gutachter_termin_status,
    t.status = 'bestaetigt'::text AS gutachter_termin_bestaetigt,
    t.vorgeschlagenes_datum AS gutachter_gegenvorschlag_datum,
    t.gegenvorschlag_grund AS gutachter_gegenvorschlag_grund,
    c.claim_nummer
   FROM faelle f
     LEFT JOIN claims c ON c.id = f.claim_id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT gt.id,
            gt.sv_id,
            gt.fall_id,
            gt.start_zeit,
            gt.end_zeit,
            gt.status,
            gt.externer_kalender_id,
            gt.ablehnungsgrund,
            gt.gegenvorschlag_zeit,
            gt.created_at,
            gt.erinnerung_24h_gesendet,
            gt.erinnerung_2h_gesendet,
            gt.erinnerung_48h_docs_gesendet,
            gt.ankunft_zeit,
            gt.abschluss_zeit,
            gt.uebersprungen,
            gt.uebersprung_grund,
            gt.notizen_vor_ort,
            gt.gps_lat_ankunft,
            gt.gps_lng_ankunft,
            gt.lead_id,
            gt.ablehnen_token,
            gt.abgelehnt_am,
            gt.abgelehnt_grund,
            gt.vorgeschlagenes_datum,
            gt.gegenvorschlag_grund,
            gt.gegenvorschlag_von,
            gt.ankunft_via,
            gt.verspaetung_minuten,
            gt.losgefahren_am,
            gt.kunden_tracking_token,
            gt.notification_losgefahren_gesendet_am,
            gt.notification_5min_gesendet_am,
            gt.notification_angekommen_gesendet_am,
            gt.ablehnen_token_expires_at,
            gt.final_verbindlich_ab,
            gt.sv_ablehnung_grund,
            gt.sv_ablehnung_am,
            gt.sv_vorgeschlagene_slots,
            gt.typ,
            gt.kanal,
            gt.video_link,
            gt.kb_id,
            gt.notiz_kunde,
            gt.notiz_intern,
            gt.reminder_sent_at,
            gt.reminder_1h_sent_at,
            gt.cancelled_at,
            gt.navigation_started_at,
            gt.sv_unterwegs_seit,
            gt.sv_eta_minuten,
            gt.sv_eta_letzte_berechnung,
            gt.sv_angekommen_am,
            gt.reminder_15min_sent_at,
            gt.reminder_5min_sent_at,
            gt.durchgefuehrt_am,
            gt.kunde_tracking_aktiviert,
            gt.kunde_losgefahren_am,
            gt.kunde_eta_minuten,
            gt.kunde_eta_letzte_berechnung,
            gt.kunde_angekommen_am,
            gt.kunde_verspaetung_gemeldet_am,
            gt.bezahlt,
            gt.honorar_betrag,
            gt.google_event_id,
            gt.google_calendar_id,
            gt.google_event_synced_at,
            gt.kunde_response_token,
            gt.kunde_response_token_expires_at,
            gt.gesehen_am,
            gt.geschaetzte_fahrtzeit_min,
            gt.auftrag_id,
            gt.verlegung_quelle_id,
            gt.verlegung_grund,
            gt.verlegung_kunde_benachrichtigt_an,
            gt.verlegung_eskalation_an_kb_an,
            gt.verlegung_initiator_kunde,
            gt.besichtigung_gestartet_am,
            gt.caldav_object_url,
            gt.caldav_event_uid,
            gt.caldav_synced_at,
            gt.erinnerung_morgen_gesendet,
            gt.sv_lead_id
           FROM gutachter_termine gt
          WHERE gt.claim_id = c.id AND (gt.status = ANY (ARRAY['bestaetigt'::text, 'verlegung_pending'::text, 'reserviert'::text, 'durchgefuehrt'::text, 'gegenvorschlag'::text]))
          ORDER BY (
                CASE gt.status
                    WHEN 'bestaetigt'::text THEN 1
                    WHEN 'verlegung_pending'::text THEN 2
                    WHEN 'gegenvorschlag'::text THEN 3
                    WHEN 'reserviert'::text THEN 4
                    WHEN 'durchgefuehrt'::text THEN 5
                    ELSE 6
                END), gt.start_zeit DESC NULLS LAST
         LIMIT 1) t ON true
     LEFT JOIN LATERAL ( SELECT a.filmcheck_ok,
            a.filmcheck_am,
            a.filmcheck_notizen,
            a.storniert_am,
            a.storno_grund,
            a.storno_durch_user_id,
            a.sv_briefing_text,
            a.sv_briefing_generated_at,
            a.sv_briefing_model,
            a.sv_briefing_version,
            a.sv_briefing_struktur,
            a.sv_notizen_vor_ort,
            a.technische_stellungnahme_status,
            a.technische_stellungnahme_notiz_sv,
            a.technische_stellungnahme_beauftragt_am,
            a.technische_stellungnahme_hochgeladen_am,
            a.technische_stellungnahme_freigabe_am
           FROM auftraege a
          WHERE a.claim_id = c.id
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON true;

-- ============================================================
-- Block 3b: v_claim_timeline (Termin-Branch f.claim_id -> gt.claim_id, JOIN faelle weg)
-- ============================================================
CREATE OR REPLACE VIEW public.v_claim_timeline AS
 SELECT event_id,
    claim_id,
    fall_id,
    event_at,
    event_typ,
    event_kategorie,
    actor_user_id,
    actor_rolle,
    payload_jsonb,
    sichtbar_fuer_kunde,
    sichtbar_fuer_sv,
    detail_url_path
   FROM ( SELECT md5('lead-aufgenommen-'::text || l.id)::uuid AS event_id,
            l.konvertiert_zu_claim_id AS claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = l.konvertiert_zu_claim_id
                 LIMIT 1) AS fall_id,
            l.created_at AS event_at,
            'lead.aufgenommen'::text AS event_typ,
            'phase'::text AS event_kategorie,
            NULL::uuid AS actor_user_id,
            'system'::text AS actor_rolle,
            jsonb_build_object('lead_id', l.id, 'quelle', l.source_channel) AS payload_jsonb,
            true AS sichtbar_fuer_kunde,
            false AS sichtbar_fuer_sv,
            NULL::text AS detail_url_path
           FROM leads l
          WHERE l.konvertiert_zu_claim_id IS NOT NULL
        UNION ALL
         SELECT md5('lead-konvertiert-'::text || l.id)::uuid AS md5,
            l.konvertiert_zu_claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = l.konvertiert_zu_claim_id
                 LIMIT 1) AS id,
            l.konvertiert_am,
            'lead.konvertiert'::text,
            'phase'::text,
            l.konvertiert_durch_user_id,
            'dispatcher'::text,
            jsonb_build_object('lead_id', l.id) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM leads l
          WHERE l.konvertiert_zu_claim_id IS NOT NULL AND l.konvertiert_am IS NOT NULL
        UNION ALL
         SELECT md5('phase-'::text || pt.id::text)::uuid AS md5,
            f.claim_id,
            pt.fall_id,
            pt.transition_at,
            'phase.geaendert'::text,
            'phase'::text,
            pt.transitioned_by,
            COALESCE(pt.actor_rolle, 'system'::text) AS "coalesce",
            jsonb_build_object('from_phase', pt.from_phase, 'to_phase', pt.to_phase, 'trigger_type', pt.trigger_type, 'grund', pt.grund) AS jsonb_build_object,
            true,
            true,
            NULL::text
           FROM phase_transitions pt
             JOIN faelle f ON f.id = pt.fall_id
          WHERE f.claim_id IS NOT NULL
        UNION ALL
         SELECT md5((('endzustand-'::text || c.id::text) || '-'::text) || c.status)::uuid AS md5,
            c.id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = c.id
                 LIMIT 1) AS id,
            c.endzustand_gesetzt_am,
            'claim.'::text || c.status,
            'phase'::text,
            c.endzustand_gesetzt_durch_user_id,
            'kb'::text,
            jsonb_build_object('status', c.status, 'regulierungs_betrag', c.regulierungs_betrag, 'vs_ablehnungs_grund', c.vs_ablehnungs_grund, 'endzustand_grund', c.endzustand_grund) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM claims c
          WHERE c.endzustand_gesetzt_am IS NOT NULL AND (c.status = ANY (ARRAY['in_kommunikation_vs'::text, 'reguliert'::text, 'abgelehnt'::text, 'an_externe_kanzlei_uebergeben'::text, 'storniert'::text]))
        UNION ALL
         SELECT md5('gutachten-beauftragt-'::text || g.id::text)::uuid AS md5,
            g.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = g.claim_id
                 LIMIT 1) AS id,
            g.created_at,
            'gutachten.beauftragt'::text,
            'gutachten'::text,
            NULL::uuid AS uuid,
            'kb'::text,
            jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id) AS jsonb_build_object,
            true,
            true,
            '/faelle/'::text || ((( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = g.claim_id
                 LIMIT 1))::text)
           FROM gutachten g
          WHERE g.claim_id IS NOT NULL
        UNION ALL
         SELECT md5('gutachten-final-'::text || g.id::text)::uuid AS md5,
            g.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = g.claim_id
                 LIMIT 1) AS id,
            g.updated_at,
            'gutachten.fertig'::text,
            'gutachten'::text,
            NULL::uuid AS uuid,
            'sv'::text,
            jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id) AS jsonb_build_object,
            true,
            true,
            '/faelle/'::text || ((( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = g.claim_id
                 LIMIT 1))::text)
           FROM gutachten g
          WHERE g.claim_id IS NOT NULL AND g.status = 'final'::text
        UNION ALL
         SELECT md5((('repair-'::text || r.id::text) || '-'::text) || r.status)::uuid AS md5,
            r.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = r.claim_id
                 LIMIT 1) AS id,
            r.updated_at,
            'repair.'::text || r.status,
            'reparatur'::text,
            NULL::uuid AS uuid,
            'system'::text,
            jsonb_build_object('repair_id', r.id, 'werkstatt_id', r.werkstatt_id, 'status', r.status) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM repairs r
          WHERE r.claim_id IS NOT NULL AND (r.status = ANY (ARRAY['geplant'::text, 'in_arbeit'::text, 'abgeschlossen'::text]))
        UNION ALL
         SELECT md5('vsk-'::text || vk.id::text)::uuid AS md5,
            vk.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = vk.claim_id
                 LIMIT 1) AS id,
            vk.datum,
            'vs.brief_versendet'::text,
            'vs'::text,
            vk.created_by_user_id,
            'kb'::text,
            jsonb_build_object('typ', vk.typ, 'kanal', vk.kanal, 'richtung', vk.richtung, 'versicherung', vk.versicherung, 'aktenzeichen', vk.aktenzeichen) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM vs_korrespondenz vk
          WHERE vk.claim_id IS NOT NULL AND vk.status <> 'archiviert'::text
        UNION ALL
         SELECT md5((('payment-'::text || cp.id::text) || '-'::text) || cp.status)::uuid AS md5,
            cp.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = cp.claim_id
                 LIMIT 1) AS id,
            cp.updated_at,
            'payment.'::text || cp.status,
            'zahlung'::text,
            NULL::uuid AS uuid,
            'kb'::text,
            jsonb_build_object('payment_id', cp.id, 'erhaltener_betrag', cp.erhaltener_betrag, 'forderungsbetrag', cp.forderungsbetrag, 'status', cp.status) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM claim_payments cp
          WHERE cp.claim_id IS NOT NULL AND (cp.status = ANY (ARRAY['erhalten'::text, 'teilweise'::text, 'final'::text]))
        UNION ALL
         SELECT md5('mietwagen-start-'::text || cm.id::text)::uuid AS md5,
            cm.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = cm.claim_id
                 LIMIT 1) AS id,
            cm.beginn_datum::timestamp with time zone AS beginn_datum,
            'mietwagen.gestartet'::text,
            'reparatur'::text,
            NULL::uuid AS uuid,
            'system'::text,
            jsonb_build_object('mietwagen_id', cm.id, 'anbieter', cm.anbieter, 'fahrzeugklasse', cm.fahrzeugklasse) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM claim_mietwagen cm
          WHERE cm.claim_id IS NOT NULL AND cm.beginn_datum IS NOT NULL AND (cm.status = ANY (ARRAY['aktiv'::text, 'beendet'::text]))
        UNION ALL
         SELECT md5('mietwagen-ende-'::text || cm.id::text)::uuid AS md5,
            cm.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = cm.claim_id
                 LIMIT 1) AS id,
            cm.tatsaechliches_ende::timestamp with time zone AS tatsaechliches_ende,
            'mietwagen.beendet'::text,
            'reparatur'::text,
            NULL::uuid AS uuid,
            'system'::text,
            jsonb_build_object('mietwagen_id', cm.id, 'tage_gesamt', cm.tage_gesamt, 'gesamtkosten_netto', cm.gesamtkosten_netto) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM claim_mietwagen cm
          WHERE cm.claim_id IS NOT NULL AND cm.tatsaechliches_ende IS NOT NULL
        UNION ALL
         SELECT md5('termin-'::text || gt.id::text)::uuid AS md5,
            gt.claim_id,
            gt.fall_id,
            COALESCE(gt.durchgefuehrt_am, gt.created_at) AS "coalesce",
                CASE
                    WHEN gt.durchgefuehrt_am IS NOT NULL THEN 'termin.durchgefuehrt'::text
                    ELSE 'termin.gebucht'::text
                END AS "case",
            'gutachten'::text,
            NULL::uuid AS uuid,
            'sv'::text,
            jsonb_build_object('termin_id', gt.id, 'typ', gt.typ, 'status', gt.status) AS jsonb_build_object,
            true,
            true,
            NULL::text
           FROM gutachter_termine gt
          WHERE gt.claim_id IS NOT NULL
        UNION ALL
         SELECT md5('airdrop-versendet-'::text || ai.id::text)::uuid AS md5,
            ai.claim_id,
            ( SELECT f.id
                   FROM faelle f
                  WHERE f.claim_id = ai.claim_id
                 LIMIT 1) AS id,
            ai.created_at,
            'airdrop.versendet'::text,
            'kommunikation'::text,
            NULL::uuid AS uuid,
            'kb'::text,
            jsonb_build_object('invitation_id', ai.id, 'status', ai.status) AS jsonb_build_object,
            true,
            false,
            NULL::text
           FROM airdrop_invitations ai
          WHERE ai.claim_id IS NOT NULL
        UNION ALL
         SELECT md5('manuell-'::text || tl.id::text)::uuid AS md5,
            f.claim_id,
            tl.fall_id,
            tl.created_at,
            'manuell.notiz'::text,
            'manuell'::text,
            tl.erstellt_von,
            'kb'::text,
            jsonb_build_object('titel', tl.titel, 'beschreibung', tl.beschreibung, 'typ', tl.typ) AS jsonb_build_object,
            COALESCE((tl.metadata ->> 'intern'::text)::boolean, false) = false,
            false,
            NULL::text
           FROM timeline tl
             JOIN faelle f ON f.id = tl.fall_id
          WHERE f.claim_id IS NOT NULL) sub;

COMMIT;
