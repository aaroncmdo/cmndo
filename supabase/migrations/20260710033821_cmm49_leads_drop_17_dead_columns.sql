-- CMM-49 leads legacy-column purge (Slice 1): 17 DB-verifiziert tote Spalten droppen.
--
-- Voll-DB-getriebener Sweep (pg_depend/pg_proc/pg_trigger/pg_policies + Daten+Default+Index):
--   * 0 Code-Writer/Reader (grep src: nur database.types.ts deklariert sie, kein echter Consumer;
--     createLead spreadet `extra`, aber KEIN Caller reicht eine der 17 rein).
--   * 0 Function / 0 Trigger / 0 RLS-Policy / 0 Index referenziert sie.
--   * 0 echte Daten (12 zero-data + 5 default-only ueber alle 332 Leads).
--   * fahrzeug_aufbau: single-column CHECK (leads_fahrzeug_aufbau_chk) -> auto-dropped mit der Spalte.
--   * Einzige Dependency = die near-select-* View v_lead_workstate (Ops-Cockpit/Dispatch).
--
-- Shape-erhaltend: die 17 werden in v_lead_workstate zu NULL-Literalen (View-Form byte-identisch:
--   selbe Spaltennamen/Typen/Reihenfolge, 24=24 Zeilen validiert) -> 0 Runtime-Impact fuer
--   getLeadWorkItems. security_invoker=true wird explizit erhalten (sonst RLS-Bypass-Regression);
--   Grants (postgres/service_role) bleiben durch CREATE OR REPLACE erhalten.
--
-- Der Ausschluss von lead_nummer (Trigger set_lead_nummer) + mandatstyp (trigger_kanzlei_provision
--   liest NEW.mandatstyp) war der Grund fuer den DB-getriebenen Ansatz -- Code-grep haette beide
--   faelschlich als tot gedroppt (Prod-Breaker).
--
-- Types (database.types.ts) bewusst NICHT hier mitregeneriert (Regel 2, Schritt 6): 0 Code referenziert
--   die 17 -> Types duerfen lagen; ein Full-Regen wuerde ausserdem fremde Schema-Drift mitbuendeln.
--   v_lead_workstate haelt jetzt 17 NULL-Cruft-Spalten -> die View-Lane trimmt sie beim naechsten
--   Projektion-Rework (dokumentiert im Marker).
--
-- Register: BROADCAST-claims-leads-normalisierung-debt-register (memory).

CREATE OR REPLACE VIEW public.v_lead_workstate WITH (security_invoker=true) AS
 SELECT l.id, l.vorname, l.nachname, l.email, l.telefon, l.status, l.source_channel, l.source_domain,
    l.kontaktversuche, l.verpasste_anrufe,
    NULL::jsonb AS missed_call_times, NULL::jsonb AS qualifizierung_data, NULL::text AS aircall_contact_id,
    l.timeline, l.wa_gesendet,
    NULL::boolean AS kanzlei_triggered,
    l.notiz, l.zugewiesen_an, l.created_at, l.updated_at, l.schadens_fall_typ, l.kunden_konstellation,
    l.personenschaden_flag, l.mietwagen_flag, l.gewerbe_flag, l.halter_ungleich_fahrer_flag, l.gegner_bekannt,
    l.polizeibericht_pflicht, l.gutachter_termin, l.kennzeichen, l.fahrzeug_hersteller, l.fahrzeug_modell,
    l.wunschtermin, l.fahrzeug_standort_adresse, l.fahrzeug_standort_plz, l.sa_unterschrieben, l.sa_unterschrieben_am,
    l.qualifizierungs_phase,
    NULL::text AS sf_variante,
    l.gegner_name, l.gegner_versicherung, l.gegner_kennzeichen, l.eigene_versicherung, l.eigene_policennr,
    l.polizei_aktenzeichen, l.leasing_geber, l.finanzierung_bank, l.firma_name, l.halter_name, l.sa_datum,
    l.vollmacht_datum, l.mandatstyp, l.anruf_versuche, l.letzter_anruf_am, l.letzter_anruf_status,
    l.flow_link_geoeffnet, l.flow_link_abgeschlossen, l.disqualifiziert, l.disqualifiziert_grund,
    l.disqualifiziert_notiz, l.disqualifiziert_am, l.unfallhergang, l.polizei_vor_ort,
    NULL::boolean AS unfallmitteilung_hochgeladen,
    l.fahrzeug_farbe, l.erstzulassung, l.fin, l.kilometerstand, l.unfallort, l.unfallort_lat, l.unfallort_lng,
    l.unfalldatum, l.kunde_adresse, l.kunde_lat, l.kunde_lng, l.konvertiert_zu_fall_id, l.spezifikation,
    l.schadens_art, l.unfall_konstellation, l.gegner_anzahl_beteiligte, l.gegner_fahrzeugtyp, l.service_typ,
    l.ist_fahrzeughalter, l.finanzierung_leasing, l.vorsteuerabzugsberechtigt, l.halter_vorname, l.halter_nachname,
    l.halter_strasse, l.halter_plz, l.halter_stadt, l.halter_telefon, l.halter_email, l.finanzierungsgeber_name,
    l.finanzierungsgeber_adresse, l.finanzierungsgeber_vertragsnr, l.kunde_strasse, l.kunde_plz, l.kunde_stadt,
    l.schadens_hergang, l.hat_vorschaeden, l.vorschaeden_beschreibung, l.schuldfrage,
    l.aufklaerung_teilschuld_bestaetigt, l.schaden_sichtbar, l.nutzungsausfall, l.hat_haftpflicht, l.schadentyp,
    l.schadentyp_freitext, l.parkplatz_kamera, l.unfallort_kategorie, l.unfallskizze_url,
    NULL::text AS zeuge_name, NULL::text AS zeuge_anschrift, NULL::text AS zeuge_telefon, NULL::text AS zeuge_email,
    l.fahrzeug_ausstattung, l.cardentity_enriched_at, l.cardentity_report, l.gespraech_gestartet_am,
    l.gespraech_beendet_am, l.gespraech_dauer_sekunden, l.fahrerflucht, l.auslandskennzeichen, l.zeugen,
    l.gegner_schadennummer, l.unfall_uhrzeit, l.fahrzeug_fahrbereit, l.fahrzeug_baujahr, l.zb1_token, l.zb1_status,
    l.zb1_url, l.zb1_ocr_daten, l.zb1_gesendet_am, l.zb1_hochgeladen_am, l.bevorzugter_kanal, l.hsn, l.tsn,
    l.gegner_versicherung_id, l.polizeibericht_token, l.polizeibericht_status, l.polizeibericht_gesendet_am,
    l.polizeibericht_hochgeladen_am, l.polizeibericht_url,
    NULL::jsonb AS polizeibericht_ocr_daten,
    l.wunschtermin_wochentage, l.zb1_token_expires_at, l.zb1_upload_versuche, l.zeugen_kontakte,
    l.werkstatt_seit_datum, l.halter_geburtsdatum, l.gegner_versicherung_anfrage_datum, l.sprache,
    l.schadensfoto_urls, l.unfallskizze_svg, l.unfallskizze_bestaetigt, l.unfallskizze_ablehnung_grund,
    l.unfallskizze_generiert_am, l.zeugen_vorhanden, l.promotion_code_id,
    NULL::jsonb AS claude_vision_analyse, NULL::jsonb AS dat_einschaetzung, NULL::text AS dat_pdf_url,
    NULL::boolean AS voice_input_quelle,
    l.reminder_token, l.reminder_1_sent_at, l.reminder_2_sent_at, l.reminder_3_sent_at, l.sachschaden_flag,
    l.sachschaden_beschreibung, l.disqualifiziert_grund_key, l.besichtigungsort_adresse, l.besichtigungsort_lat,
    l.besichtigungsort_lng, l.besichtigungsort_place_id, l.vollmacht_signiert_am, l.bkat_unfallart,
    l.fahrzeug_standort_lat, l.fahrzeug_standort_lng, l.fahrzeug_standort_place_id, l.fahrzeugschaden_beschreibung,
    l.vehicle_id, l.lead_nummer, l.konvertiert_zu_claim_id, l.konvertiert_am, l.konvertiert_durch_user_id,
    l.fehlende_felder_jsonb, l.anrede, l.lackfarbe_code, l.rueckruf_geplant_am,
    NULL::text AS ansprechpartner_beziehung,
    l.kunde_id, l.kennzeichen_kreis, l.kennzeichen_buchstaben, l.kennzeichen_zahl, l.kennzeichen_suffix,
    NULL::text AS fahrzeug_aufbau,
    l.besichtigungsort_notiz, l.brn, l.whatsapp_verfuegbar, l.whatsapp_geprueft_am, l.hat_whatsapp, l.ga_client_id,
    l.kanzlei_wunsch, l.gegner_telefon, l.gegner_email, l.zeugenaussage_url, l.zeugenaussage_status,
    l.zeugenaussage_hochgeladen_am, l.werkstatt_id, l.kostenvoranschlag_netto, l.kostenvoranschlag_brutto,
    l.reparatur_werkstatt_id, l.reparatur_werkstatt_zugewiesen_am, l.reparatur_werkstatt_zugewiesen_von,
    l.reparatur_werkstatt_quelle, l.reparaturwunsch, l.reparatur_vermittlung_status, l.reparatur_werkstatt_extern,
    l.winback_sent_at, l.winback_opt_out, l.reminder_4_sent_at, l.schadenskategorie, l.reparatur_wunschtermin,
    l.dsgvo_zustimmung_am, l.abrechnungsweg,
    t.status AS termin_status, f.gesendet_am AS fl_gesendet_am, f.geoeffnet_am AS fl_geoeffnet_am,
    f.abgeschlossen_am AS fl_abgeschlossen_am, f.fall_id AS fl_fall_id
   FROM leads l
     LEFT JOIN LATERAL ( SELECT gt.status FROM gutachter_termine gt
          WHERE gt.lead_id = l.id AND (gt.status = ANY (ARRAY['reserviert'::text, 'bestaetigt'::text]))
          ORDER BY gt.start_zeit DESC NULLS LAST LIMIT 1) t ON true
     LEFT JOIN LATERAL ( SELECT fl.gesendet_am, fl.geoeffnet_am, fl.abgeschlossen_am, fl.fall_id
           FROM flow_links fl WHERE fl.lead_id = l.id ORDER BY fl.erstellt_am DESC NULLS LAST LIMIT 1) f ON true
  WHERE COALESCE(l.disqualifiziert, false) = false
    AND (COALESCE(l.status::text, ''::text) <> ALL (ARRAY['umgewandelt'::text, 'umgewandelt-sv'::text, 'disqualifiziert'::text, 'kalt'::text]))
    AND (COALESCE(l.qualifizierungs_phase, ''::text) <> ALL (ARRAY['konvertiert'::text, 'abgeschlossen'::text, 'kalt'::text, 'disqualifiziert'::text]));

ALTER TABLE public.leads
  DROP COLUMN missed_call_times,
  DROP COLUMN qualifizierung_data,
  DROP COLUMN aircall_contact_id,
  DROP COLUMN kanzlei_triggered,
  DROP COLUMN sf_variante,
  DROP COLUMN unfallmitteilung_hochgeladen,
  DROP COLUMN zeuge_name,
  DROP COLUMN zeuge_anschrift,
  DROP COLUMN zeuge_telefon,
  DROP COLUMN zeuge_email,
  DROP COLUMN polizeibericht_ocr_daten,
  DROP COLUMN claude_vision_analyse,
  DROP COLUMN dat_einschaetzung,
  DROP COLUMN dat_pdf_url,
  DROP COLUMN voice_input_quelle,
  DROP COLUMN ansprechpartner_beziehung,
  DROP COLUMN fahrzeug_aufbau;
