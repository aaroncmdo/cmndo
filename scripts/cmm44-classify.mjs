#!/usr/bin/env node
// CMM-44 Phase-1 Dekomposition: klassifiziert alle 341 faelle-Spalten in
// Domaenen-Cluster + Heimat-Tabelle + Verdikt. Liest cmm44-faelle-cols.json
// (aus probe-Schritt: name/type/claims-flag/coverage).
//
// Verdikt-Codes:
//   DUP     - Namensgleiche Spalte existiert bereits auf claims -> faelle-seitig droppen
//   MOVE    - In Heimat-Tabelle verschieben (semantisch dort zuhause)
//   CLAIMS  - Nach claims ziehen (claim-globale Eigenschaft, noch nicht dort)
//   DROP    - Tot/Legacy/redundant -> ersatzlos droppen (Vertikal-Audit bestaetigt)
//   FK      - Strukturelle FK/PK-Spalte
//   TBD     - Klassifizierung braucht Vertikal-/Cardentity-Audit
//
// Run: node scripts/cmm44-classify.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const base = 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/wt-cmm44-dekomp/scripts/'
const cols = JSON.parse(readFileSync(base + 'cmm44-faelle-cols.json', 'utf8'))

// Explizite Pro-Spalte-Klassifizierung. cluster | home | verdict | note
const M = {
  // --- Struktur / FK ---
  id: ['Struktur', 'faelle', 'FK', 'PK'],
  claim_id: ['Struktur', 'claims', 'FK', 'FK->claims, beim Drop weg'],
  lead_id: ['Struktur', 'claims', 'DUP', 'auf claims'],
  vehicle_id: ['Struktur', 'vehicles', 'DUP', 'FK auf claims vorhanden'],
  organisation_id: ['Struktur', 'claims', 'TBD', 'Org-Zuordnung — Reader pruefen'],
  makler_id: ['Struktur', 'claims', 'CLAIMS', 'Makler-Herkunft des Claims'],
  dispatch_id: ['Struktur', 'claims', 'TBD', '0-cov — Dispatcher-Zuordnung, evtl DROP'],

  // --- Workflow / Status (claims-global) ---
  fall_nummer: ['Workflow', 'claims', 'DUP', 'claim_nummer auf claims'],
  status: ['Workflow', 'claims', 'DUP', 'auf claims'],
  aktuelle_phase: ['Workflow', 'claims', 'DUP', 'phase auf claims'],
  status_changed_at: ['Workflow', 'claims', 'CLAIMS', 'Status-Zeitstempel'],
  betreuungspaket: ['Workflow', 'claims', 'CLAIMS', 'Paket-Zuordnung'],
  service_typ: ['Workflow', 'claims', 'CLAIMS', 'Service-Variante'],
  szenario: ['Workflow', 'claims', 'CLAIMS', 'Fall-Szenario'],
  spezifikation: ['Workflow', 'claims', 'DUP', 'auf claims'],
  prioritaet: ['Workflow', 'claims', 'CLAIMS', 'Bearbeitungsprio'],
  sprache: ['Workflow', 'claims', 'CLAIMS', 'Kommunikationssprache'],
  bevorzugter_kanal: ['Workflow', 'claims', 'CLAIMS', 'Praeferierter Kanal'],
  ist_aktiv: ['Workflow', 'claims', 'CLAIMS', 'Aktiv-Flag'],
  onboarding_complete: ['Workflow', 'claims', 'CLAIMS', 'Onboarding-Gate'],
  datenschutz_akzeptiert: ['Workflow', 'claims', 'CLAIMS', 'DSGVO-Zustimmung'],
  datenschutz_akzeptiert_am: ['Workflow', 'claims', 'CLAIMS', 'DSGVO-Zeitstempel'],
  notizen: ['Workflow', 'claims', 'CLAIMS', 'Freitext-Notiz'],
  interne_notizen: ['Workflow', 'claims', 'CLAIMS', 'Interne Notiz'],
  filmcheck_ok: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-LC QC-Schritt'],
  filmcheck_am: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-LC QC-Schritt'],
  filmcheck_notizen: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-LC QC-Schritt'],
  created_at: ['Workflow', 'claims', 'DUP', 'auf claims'],
  updated_at: ['Workflow', 'claims', 'DUP', 'auf claims'],
  konvertiert_am: ['Workflow', 'claims', 'TBD', 'Lead-Konversion — leads.konvertiert_* SSoT'],
  konvertiert_von_lead: ['Workflow', 'claims', 'DUP', 'lead_id auf claims'],
  fallakte_angelegt_am: ['Workflow', 'claims', 'CLAIMS', 'Fallakte-Anlage-Zeit'],
  besichtigung_gestartet_am: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-LC'],
  abgeschlossen_am: ['Workflow', 'claims', 'DUP', 'auf claims'],
  geschlossen_grund: ['Workflow', 'claims', 'CLAIMS', 'Abschluss-Grund'],
  deaktiviert_am: ['Workflow', 'claims', 'CLAIMS', 'Deaktivierung'],
  deaktiviert_grund: ['Workflow', 'claims', 'CLAIMS', 'Deaktivierung'],
  deaktiviert_notiz: ['Workflow', 'claims', 'CLAIMS', 'Deaktivierung'],
  storniert_am: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-Storno'],
  storno_grund: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-Storno'],
  storno_durch_user_id: ['Workflow', 'auftraege', 'MOVE', 'Auftrag-Storno'],
  no_show_gemeldet_am: ['Workflow', 'gutachter_termine', 'MOVE', 'Termin-No-Show'],
  no_show_count: ['Workflow', 'claims', 'DUP', 'kunde_no_show_count/sv_no_show_count auf claims'],
  google_review_gesendet: ['Workflow', 'claims', 'CLAIMS', 'Review-Flag'],
  google_review_prompt_gezeigt_am: ['Workflow', 'claims', 'CLAIMS', 'Review-Prompt'],

  // --- Zuweisung (SV / KB / Eskalation) ---
  sv_id: ['Zuweisung', 'claims', 'DUP', 'CMM-60 erledigt — claims.sv_id SSoT'],
  sv_zugewiesen_am: ['Zuweisung', 'claims', 'CLAIMS', 'SV-Zuweisungszeit'],
  kundenbetreuer_id: ['Zuweisung', 'claims', 'DUP', 'auf claims'],
  kundenbetreuer_zugewiesen_am: ['Zuweisung', 'claims', 'CLAIMS', 'KB-Zuweisungszeit'],
  kundenbetreuer_fallback_flag: ['Zuweisung', 'claims', 'CLAIMS', 'KB-Fallback'],
  eskaliert_an_admin_id: ['Zuweisung', 'claims', 'CLAIMS', 'Admin-Eskalation'],
  eskaliert_am: ['Zuweisung', 'claims', 'CLAIMS', 'Admin-Eskalation'],
  eskaliert_grund: ['Zuweisung', 'claims', 'CLAIMS', 'Admin-Eskalation'],

  // --- Unfall / Schaden-Stammdaten ---
  schadens_beschreibung: ['Unfall', 'claims', 'DUP', 'hergang_kunde_text auf claims'],
  schadens_datum: ['Unfall', 'claims', 'DUP', 'schadentag auf claims'],
  unfalldatum: ['Unfall', 'claims', 'DUP', 'schadentag auf claims'],
  unfall_uhrzeit: ['Unfall', 'claims', 'DUP', 'schadenzeit auf claims'],
  schadens_entdeckt_am: ['Unfall', 'claims', 'DUP', 'entdeckt_am auf claims'],
  schadens_adresse: ['Unfall', 'claims', 'DUP', 'schadenort_adresse auf claims'],
  schadens_plz: ['Unfall', 'claims', 'DUP', 'schadenort_plz auf claims'],
  schadens_ort: ['Unfall', 'claims', 'DUP', 'schadenort_ort auf claims'],
  unfallort: ['Unfall', 'claims', 'DUP', 'schadenort_adresse auf claims'],
  unfallort_lat: ['Unfall', 'claims', 'DUP', 'schadenort_lat auf claims'],
  unfallort_lng: ['Unfall', 'claims', 'DUP', 'schadenort_lng auf claims'],
  unfallort_kategorie: ['Unfall', 'claims', 'DUP', 'schadenort_kategorie auf claims'],
  schadens_fall_typ: ['Unfall', 'claims', 'DUP', 'fall_typ auf claims'],
  schadens_art: ['Unfall', 'claims', 'DUP', 'schadenart auf claims'],
  schadentyp: ['Unfall', 'claims', 'DUP', 'schadenart auf claims'],
  schadens_ursache: ['Unfall', 'claims', 'CLAIMS', 'Schadensursache-Freitext'],
  schadens_hergang: ['Unfall', 'claims', 'DUP', 'hergang_kunde_text auf claims'],
  unfallhergang: ['Unfall', 'claims', 'DUP', 'hergang_kunde_text auf claims'],
  unfall_konstellation: ['Unfall', 'claims', 'DUP', 'auf claims'],
  kunden_konstellation: ['Unfall', 'claims', 'DUP', 'auf claims'],
  bkat_unfallart: ['Unfall', 'claims', 'CLAIMS', 'BKAT-Unfallart-Enum'],
  schadens_hoehe_netto: ['Unfall', 'claims', 'CLAIMS', 'Geschaetzte Schadenshoehe'],
  fahrerflucht: ['Unfall', 'claims', 'DUP', 'auf claims'],
  auslandskennzeichen: ['Unfall', 'claims', 'DUP', 'auf claims'],
  personenschaden_flag: ['Unfall', 'claims', 'DUP', 'hat_personenschaden auf claims'],
  sachschaden_flag: ['Unfall', 'claims', 'DUP', 'hat_sachschaden auf claims'],
  sachschaden_beschreibung: ['Unfall', 'claims', 'DUP', 'auf claims'],
  gewerbe_flag: ['Unfall', 'claims', 'DUP', 'auf claims'],
  halter_ungleich_fahrer_flag: ['Unfall', 'claims', 'DUP', 'halter_ungleich_fahrer auf claims'],
  ist_fahrzeughalter: ['Unfall', 'claim_parties', 'MOVE', 'claim_parties.ist_halter'],
  zeugen_vorhanden: ['Unfall', 'claims', 'CLAIMS', 'Zeugen-Flag'],
  zeugen_kontakte: ['Unfall', 'claim_parties', 'DUP', 'auf claims (A6: claim_parties rolle=zeuge)'],
  unfallskizze_url: ['Unfall', 'claims', 'DUP', 'auf claims'],
  unfallskizze_svg: ['Unfall', 'claims', 'DUP', 'auf claims'],
  unfallskizze_bestaetigt: ['Unfall', 'claims', 'DUP', 'auf claims'],
  unfallskizze_ablehnung_grund: ['Unfall', 'claims', 'DUP', 'auf claims'],
  unfallskizze_generiert_am: ['Unfall', 'claims', 'DUP', 'auf claims'],

  // --- Polizei ---
  polizei_aktenzeichen: ['Polizei', 'claims', 'DUP', 'auf claims'],
  polizei_bericht_vorhanden: ['Polizei', 'claims', 'DUP', 'auf claims'],
  polizei_vor_ort: ['Polizei', 'claims', 'DUP', 'auf claims'],
  polizeibericht_status: ['Polizei', 'claims', 'DUP', 'auf claims'],

  // --- Gegner / Verursacher ---
  gegner_name: ['Gegner', 'claim_parties', 'MOVE', 'claim_parties rolle=verursacher'],
  gegner_versicherung: ['Gegner', 'claim_parties', 'MOVE', 'cp.versicherung_klartext'],
  gegner_versicherung_id: ['Gegner', 'claims', 'DUP', 'auf claims'],
  gegner_versicherungsnummer: ['Gegner', 'claims', 'DUP', 'auf claims'],
  gegner_schadennummer: ['Gegner', 'claims', 'DUP', 'gegner_aktenzeichen auf claims'],
  gegner_kennzeichen: ['Gegner', 'claim_parties', 'MOVE', 'cp.kennzeichen'],
  gegner_fahrzeugtyp: ['Gegner', 'claim_parties', 'MOVE', 'cp.fahrzeugtyp_klartext'],
  gegner_bekannt: ['Gegner', 'claims', 'DUP', 'auf claims'],
  gegner_anzahl_beteiligte: ['Gegner', 'claims', 'DUP', 'anzahl_beteiligte_total auf claims'],
  gegner_versicherung_anfrage_datum: ['Gegner', 'kanzlei_faelle', 'MOVE', 'VS-Anfrage-Zeit'],

  // --- Kunde-Snapshot ---
  kunde_id: ['Kunde', 'claim_parties', 'MOVE', 'cp rolle=geschaedigter / claims.geschaedigter_user_id'],
  kunde_vorname: ['Kunde', 'claim_parties', 'MOVE', 'cp.vorname'],
  kunde_nachname: ['Kunde', 'claim_parties', 'MOVE', 'cp.nachname'],
  kunde_telefon: ['Kunde', 'claim_parties', 'MOVE', 'cp.telefon'],
  kunde_email: ['Kunde', 'claims', 'DUP', 'auf claims (CMM-60 Whitelist)'],
  kunde_strasse: ['Kunde', 'claim_parties', 'MOVE', 'cp.adresse_strasse'],
  kunde_plz: ['Kunde', 'claim_parties', 'MOVE', 'cp.adresse_plz'],
  kunde_stadt: ['Kunde', 'claim_parties', 'MOVE', 'cp.adresse_ort'],
  kunde_adresse: ['Kunde', 'claim_parties', 'MOVE', 'cp Adress-Felder'],
  kunde_lat: ['Kunde', 'claims', 'TBD', 'Kunde-Geocoding — Reader pruefen'],
  kunde_lng: ['Kunde', 'claims', 'TBD', 'Kunde-Geocoding — Reader pruefen'],
  kunde_match_via: ['Kunde', 'claims', 'DROP', '0-cov Diagnose-Feld'],

  // --- Halter ---
  halter_vorname: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_nachname: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_name: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_strasse: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_plz: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_stadt: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_telefon: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_email: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],
  halter_geburtsdatum: ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter'],

  // --- Fahrzeug-Spec -> vehicles ---
  kennzeichen: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.kennzeichen_aktuell'],
  kennzeichen_kreis: ['Fahrzeug', 'claim_parties', 'MOVE', 'cp.kennzeichen_kreis vorhanden'],
  kennzeichen_buchstaben: ['Fahrzeug', 'claim_parties', 'MOVE', 'cp.kennzeichen_buchstaben'],
  kennzeichen_zahl: ['Fahrzeug', 'claim_parties', 'MOVE', 'cp.kennzeichen_zahl'],
  kennzeichen_suffix: ['Fahrzeug', 'claim_parties', 'MOVE', 'cp.kennzeichen_suffix'],
  fahrzeug_typ: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles Stammdaten'],
  fahrzeug_hersteller: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.hersteller'],
  fahrzeug_modell: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.modell_haupttyp'],
  fahrzeug_baujahr: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.baujahr_monat'],
  fahrzeug_farbe: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.farbe_klartext'],
  fahrzeug_aufbau: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.aufbau'],
  fahrzeug_ausstattung: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles Spec'],
  lackfarbe_code: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.farbcode'],
  erstzulassung: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.erstzulassung'],
  kilometerstand: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.aktueller_kilometerstand'],
  hsn: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.hsn'],
  tsn: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.tsn'],
  fin_vin: ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles.fin'],
  fin_quelle: ['Fahrzeug', 'vehicles', 'DROP', 'Diagnose — vehicles trackt Pull selbst'],
  fin_extrahiert_am: ['Fahrzeug', 'vehicles', 'DROP', 'vehicles.cardentity_letzter_pull'],
  fahrzeug_fahrbereit: ['Fahrzeug-Schaden', 'claims', 'CLAIMS', 'claim-spezifischer Zustand'],
  fahrzeugschaden_beschreibung: ['Fahrzeug-Schaden', 'claims', 'CLAIMS', 'claim-spezifisch'],
  werkstatt_seit_datum: ['Fahrzeug-Schaden', 'claims', 'CLAIMS', 'Werkstatt-Eingang'],
  zb1_status: ['Fahrzeug', 'claims', 'CLAIMS', 'ZB1-Dokumentstatus'],

  // --- Cardentity / Vorschaeden (TBD — §3.1c) ---
  vorschaden_geprueft: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaden_anzahl: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaden_letzter_datum: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaden_typ_a_ergebnis: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaden_typ_b_bericht: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaden_typ_b_pdf_url: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaden_erkannt: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  hat_vorschaeden: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  vorschaeden_beschreibung: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  cardentity_abfrage_am: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],
  cardentity_enriched_at: ['Vorschaeden', 'vehicles', 'TBD', 'Cardentity-Audit §3.1c'],
  cardentity_report: ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit §3.1c'],

  // --- Gutachten / OCR -> gutachten ---
  gutachten_vorhanden: ['Gutachten', 'gutachten', 'MOVE', 'abgeleitet aus gutachten.status'],
  gutachten_eingegangen_am: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.fertiggestellt_am'],
  gutachten_hochgeladen_am: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.pdf_uploaded_at'],
  gutachten_betrag: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.gesamt_schadensbetrag'],
  gutachten_positionen: ['Gutachten', 'gutachten', 'MOVE', 'gutachten Sub-Table'],
  gutachten_nummer: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.auftragsnummer'],
  gutachten_stundensatz: ['Gutachten', 'gutachten', 'MOVE', 'gutachten Lohnsatz-Felder'],
  gutachter_honorar: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.gutachten_sv_honorar_*'],
  reparaturkosten: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.reparaturkosten_*'],
  wertminderung: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.minderwert'],
  ocr_extrahiert_am: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.ocr_finished_at'],
  ocr_rohdaten: ['Gutachten', 'gutachten', 'MOVE', 'gutachten.gutachten_ocr_raw'],
  ki_kalkulation: ['Gutachten', 'gutachten', 'TBD', 'KI-Schaetzung — Reader pruefen'],
  ki_kalkulation_am: ['Gutachten', 'gutachten', 'TBD', 'KI-Schaetzung'],
  ki_geschaetzte_kosten_min: ['Gutachten', 'gutachten', 'TBD', 'KI-Schaetzung'],
  ki_geschaetzte_kosten_max: ['Gutachten', 'gutachten', 'TBD', 'KI-Schaetzung'],

  // --- Mietwagen / Nutzungsausfall ---
  mietwagen_flag: ['Mietwagen', 'claims', 'DUP', 'hat_mietwagen auf claims'],
  mietwagen_hat: ['Mietwagen', 'claims', 'DUP', 'hat_mietwagen auf claims'],
  nutzungsausfall: ['Mietwagen', 'claims', 'DUP', 'hat_nutzungsausfall auf claims'],
  nutzungsausfall_tagessatz: ['Mietwagen', 'gutachten', 'MOVE', 'gutachten.gutachten_nutzungsausfall_tagessatz_eur'],
  nutzungsausfall_gesamt: ['Mietwagen', 'gutachten', 'MOVE', 'gutachten Nutzungsausfall'],
  reparaturdauer_tage: ['Mietwagen', 'gutachten', 'MOVE', 'gutachten.wiederbeschaffungsdauer_tage'],
  mietwagen_seit_datum: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Zeitraum'],
  mietwagen_limit_tage: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Limit'],
  mietwagen_limit_grund: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Limit'],
  mietwagen_rechnung_vorhanden: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Beleg'],
  mietwagen_rechnung_url: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Beleg'],
  mietwagen_argumentations_puffer: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Argumentation'],
  mietwagen_vermieter: ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen-Vermieter'],
  mietwagen_kanzlei_informiert: ['Mietwagen', 'kanzlei_faelle', 'MOVE', 'Kanzlei-Info'],
  mietwagen_kanzlei_informiert_am: ['Mietwagen', 'kanzlei_faelle', 'MOVE', 'Kanzlei-Info'],

  // --- Termin (gutachter_termine) ---
  wunschtermin: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Sub-Table'],
  gcal_event_id: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Sub-Table'],
  geschaetzte_fahrzeit_min: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Routing'],
  geschaetzte_fahrdistanz_km: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Routing'],
  losfahren_erinnerung_gesendet: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Reminder'],
  termin_erinnerung_5min_gesendet: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Reminder'],
  sv_termin_dokument_reminder_gesendet_am: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Reminder'],
  besichtigungsort_adresse: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Ort'],
  besichtigungsort_lat: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Ort'],
  besichtigungsort_lng: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Ort'],
  besichtigungsort_place_id: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Ort'],
  besichtigungsort_notiz: ['Termin', 'gutachter_termine', 'MOVE', 'Termin-Ort'],
  re_termin_token: ['Termin', 'gutachter_termine', 'MOVE', 'Re-Termin-Flow'],
  re_termin_token_eingelaufen_am: ['Termin', 'gutachter_termine', 'MOVE', 'Re-Termin-Flow'],
  re_termin_eskalation_an_kb_am: ['Termin', 'gutachter_termine', 'MOVE', 'Re-Termin-Flow'],

  // --- SV-Briefing ---
  sv_briefing_text: ['SV-Briefing', 'auftraege', 'MOVE', 'Auftrag-LC Briefing'],
  sv_briefing_generated_at: ['SV-Briefing', 'auftraege', 'MOVE', 'Auftrag-LC Briefing'],
  sv_briefing_model: ['SV-Briefing', 'auftraege', 'MOVE', 'Auftrag-LC Briefing'],
  sv_briefing_version: ['SV-Briefing', 'auftraege', 'MOVE', 'Auftrag-LC Briefing'],
  sv_briefing_struktur: ['SV-Briefing', 'auftraege', 'MOVE', 'Auftrag-LC Briefing'],
  sv_notizen_vor_ort: ['SV-Briefing', 'auftraege', 'MOVE', 'SV-Vor-Ort-Notiz'],
  technische_stellungnahme_notiz_sv: ['SV-Briefing', 'auftraege', 'MOVE', 'SV-TS-Notiz'],

  // --- Dokumente / Vollmacht / SA ---
  vollmacht_pdf: ['Dokumente', 'claims', 'CLAIMS', 'oder dokumente-Tabelle'],
  vollmacht_signiert_am: ['Dokumente', 'claims', 'CLAIMS', 'Vollmacht-Signatur'],
  vollmacht_status: ['Dokumente', 'claims', 'CLAIMS', 'Vollmacht-Status'],
  vollmacht_geprueft_am: ['Dokumente', 'claims', 'CLAIMS', 'Vollmacht-Pruefung'],
  vollmacht_geprueft_von: ['Dokumente', 'claims', 'CLAIMS', 'Vollmacht-Pruefung'],
  vollmacht_pruefung_status: ['Dokumente', 'claims', 'CLAIMS', 'Vollmacht-Pruefung'],
  vollmacht_pruefung_begruendung: ['Dokumente', 'claims', 'CLAIMS', 'Vollmacht-Pruefung'],
  abtretung_pdf: ['Dokumente', 'claims', 'CLAIMS', 'oder dokumente-Tabelle'],
  abtretung_signiert_am: ['Dokumente', 'claims', 'CLAIMS', 'Abtretung-Signatur'],
  sa_unterschrieben: ['Dokumente', 'claims', 'CLAIMS', 'SA-Signatur'],
  sa_unterschrieben_am: ['Dokumente', 'claims', 'CLAIMS', 'SA-Signatur'],
  sa_pdf_url: ['Dokumente', 'claims', 'CLAIMS', 'SA-PDF'],
  sa_unterschrift_url: ['Dokumente', 'claims', 'CLAIMS', 'SA-Unterschrift'],
  anschlussschreiben_url: ['Dokumente', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC AS'],
  anschlussschreiben_am: ['Dokumente', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC AS'],
  anschlussschreiben_sendedatum: ['Dokumente', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC AS'],
  anschlussschreiben_unterschrift: ['Dokumente', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC AS'],
  anschlussschreiben_ocr_am: ['Dokumente', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC AS'],
  zb1: ['Dokumente', 'claims', 'TBD', 'placeholder'],

  // --- Kanzlei / Regulierung / VS (Kanzleifall-LC) ---
  kanzlei_id: ['Kanzlei', 'kanzlei_faelle', 'TBD', 'Kanzlei-Zuordnung — kanzlei_faelle?'],
  kanzlei_uebergeben_am: ['Kanzlei', 'claims', 'DUP', 'auf claims'],
  kanzlei_ansprechpartner_name: ['Kanzlei', 'claims', 'DUP', 'auf claims'],
  kanzlei_ansprechpartner_email: ['Kanzlei', 'claims', 'DUP', 'auf claims'],
  kanzlei_ansprechpartner_telefon: ['Kanzlei', 'claims', 'DUP', 'auf claims'],
  kanzlei_ansprechpartner_position: ['Kanzlei', 'claims', 'CLAIMS', 'fehlt noch auf claims'],
  mandatsnummer: ['Kanzlei', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Mandat'],
  lexdrive_case_id: ['Kanzlei', 'kanzlei_faelle', 'MOVE', 'LexDrive-Case'],
  lexdrive_ocr_data: ['Kanzlei', 'kanzlei_faelle', 'MOVE', 'LexDrive-OCR'],
  lexdrive_ocr_received_at: ['Kanzlei', 'kanzlei_faelle', 'MOVE', 'LexDrive-OCR'],
  klage_uebergeben_am: ['Kanzlei', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Klage'],
  regulierung_betrag: ['Regulierung', 'claims', 'DUP', 'regulierungs_betrag auf claims'],
  regulierung_am: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Regulierung'],
  regulierung_angekuendigt_am: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Regulierung'],
  regulierungsweise: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Regulierung'],
  vs_eskalationsstufe: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Eskalation'],
  vs_reaktion_typ: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Reaktion'],
  vs_reaktion_am: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Reaktion'],
  vs_ablehnungsgrund: ['Regulierung', 'claims', 'DUP', 'vs_ablehnungs_grund auf claims'],
  vs_frist_bis: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Frist'],
  vs_kuerzung_grund: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Kuerzung'],
  vs_kuerzungs_typ: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Kuerzung'],
  vs_quote_prozent: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Quote'],
  vs_quote_grund: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Quote'],
  vs_quote_akzeptiert_am: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Quote'],
  vs_quote_betrag_ausgezahlt: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Quote'],
  kuerzungs_betrag: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Kuerzung'],
  regulierungsweise2: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'placeholder'],

  // --- Anschlussschreiben (AS) Detail / Eskalation ---
  as_geforderte_summe: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'AS-Detail'],
  as_frist: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'AS-Detail'],
  as_vs_reaktion_text: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'AS-Detail'],
  as_salesforce_id: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'AS-Salesforce'],
  as_zuletzt_synced_am: ['Regulierung', 'kanzlei_faelle', 'MOVE', 'AS-Sync'],
  eskalation_tag_14_am: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_21_am: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_28_am: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_14_ergebnis: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_14_ergebnis_am: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_14_ergebnis_von: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_21_ergebnis: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_21_ergebnis_am: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_21_ergebnis_von: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_28_ergebnis: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_28_ergebnis_am: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],
  eskalation_tag_28_ergebnis_von: ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC Eskalation'],

  // --- Ruege ---
  ruege_erhalten_am: ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow'],
  ruege_grund: ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow'],
  ruege_gesendet_am: ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow'],
  ruege_betrag: ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow'],
  ruege_counter: ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow'],
  ruege_frist_tage: ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow'],

  // --- Technische Stellungnahme / Nachbesichtigung ---
  technische_stellungnahme_status: ['TechStellungnahme', 'auftraege', 'MOVE', 'TS-Workflow'],
  technische_stellungnahme_beauftragt_am: ['TechStellungnahme', 'auftraege', 'MOVE', 'TS-Workflow'],
  technische_stellungnahme_hochgeladen_am: ['TechStellungnahme', 'auftraege', 'MOVE', 'TS-Workflow'],
  technische_stellungnahme_freigabe_am: ['TechStellungnahme', 'auftraege', 'MOVE', 'TS-Workflow'],
  nachbesichtigung_status: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_angefordert_am: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_termin_datum: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_konfrontation: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_ergebnis: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_kunde_termin_vorschlaege: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_kunde_termin_eingereicht_am: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_sv_konfrontation_gewuenscht: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],
  nachbesichtigung_sv_termin_vereinbart_am: ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung'],

  // --- Abrechnung / Finanzen ---
  abrechnung_id: ['Abrechnung', 'abrechnungen', 'MOVE', 'abrechnungen-FK'],
  kanzlei_abrechnung_id: ['Abrechnung', 'abrechnungen', 'MOVE', 'Kanzlei-Abrechnung-FK'],
  kanzlei_honorar: ['Abrechnung', 'kanzlei_faelle', 'MOVE', 'Kanzlei-Honorar'],
  kanzlei_provision_status: ['Abrechnung', 'kanzlei_faelle', 'MOVE', 'Kanzlei-Provision'],
  kanzlei_provision_ausgezahlt_am: ['Abrechnung', 'kanzlei_faelle', 'MOVE', 'Kanzlei-Provision'],
  zahlung_eingegangen_am: ['Abrechnung', 'abrechnungen', 'MOVE', 'Zahlungseingang'],
  zahlung_erwartet_am: ['Abrechnung', 'abrechnungen', 'MOVE', 'Zahlungsplan'],
  zahlung_betrag: ['Abrechnung', 'abrechnungen', 'MOVE', 'Zahlung'],
  zahlungsweg: ['Abrechnung', 'abrechnungen', 'MOVE', 'Zahlungsweg'],
  schlussabrechnung_am: ['Abrechnung', 'abrechnungen', 'MOVE', 'Schlussabrechnung'],
  sv_nachzahlung_netto: ['Abrechnung', 'abrechnungen', 'MOVE', 'SV-Nachzahlung'],
  guthaben_verrechnet_netto: ['Abrechnung', 'abrechnungen', 'MOVE', 'Guthaben-Verrechnung'],
  lead_preis_netto: ['Abrechnung', 'claims', 'TBD', 'Lead-Preis — leads?'],
  lead_preis_typ: ['Abrechnung', 'claims', 'TBD', 'Lead-Preis — leads?'],
  lead_preis_berechnet_am: ['Abrechnung', 'claims', 'TBD', 'Lead-Preis — leads?'],
  iban: ['Abrechnung', 'claim_parties', 'TBD', 'Bankdaten — claim_parties oder profiles'],
  bic: ['Abrechnung', 'claim_parties', 'TBD', 'Bankdaten'],
  kontoinhaber: ['Abrechnung', 'claim_parties', 'TBD', 'Bankdaten'],
  bankdaten_hinterlegt_am: ['Abrechnung', 'claim_parties', 'TBD', 'Bankdaten'],
  abrechnungsart_besprochen: ['Abrechnung', 'claims', 'CLAIMS', 'Abrechnungsart'],
  abrechnungsart_notiz: ['Abrechnung', 'claims', 'CLAIMS', 'Abrechnungsart'],
  abrechnungsart_besprochen_am: ['Abrechnung', 'claims', 'CLAIMS', 'Abrechnungsart'],
  auszahlung_kunde_betrag: ['Abrechnung', 'kanzlei_faelle', 'MOVE', 'Kunde-Auszahlung'],
  auszahlung_kunde_eingegangen_am: ['Abrechnung', 'kanzlei_faelle', 'MOVE', 'Kunde-Auszahlung'],
  auszahlung_gutachter_betrag: ['Abrechnung', 'abrechnungen', 'MOVE', 'SV-Auszahlung'],
  auszahlung_gutachter_eingegangen_am: ['Abrechnung', 'abrechnungen', 'MOVE', 'SV-Auszahlung'],
  auszahlung_zahlungsweg: ['Abrechnung', 'abrechnungen', 'MOVE', 'Auszahlungsweg'],

  // --- Marketing ---
  marketing_quelle: ['Marketing', 'claims', 'TBD', 'Marketing-Herkunft — leads?'],
  marketing_provision: ['Marketing', 'claims', 'TBD', 'Marketing-Provision'],
  marketing_provision_status: ['Marketing', 'claims', 'TBD', 'Marketing-Provision'],
  source_channel: ['Marketing', 'claims', 'TBD', 'Akquise-Kanal — created_via auf claims?'],
  source_domain: ['Marketing', 'claims', 'DROP', '0-cov'],

  // --- Finanzierung / Leasing ---
  finanzierung_leasing: ['Finanzierung', 'claims', 'DUP', 'auf claims'],
  vorsteuerabzugsberechtigt: ['Finanzierung', 'claims', 'DUP', 'auf claims'],
  finanzierungsgeber_name: ['Finanzierung', 'claims', 'DUP', 'auf claims'],
  finanzierungsgeber_adresse: ['Finanzierung', 'claims', 'DUP', 'auf claims'],
  finanzierungsgeber_vertragsnr: ['Finanzierung', 'claims', 'DUP', 'auf claims'],
  leasinggeber_name: ['Finanzierung', 'claims', 'DROP', 'AAR-918 droppte claims-Twin — Legacy'],
  leasinggeber_informiert: ['Finanzierung', 'claims', 'CLAIMS', 'Leasinggeber-Info-Flag'],
  bank_name: ['Finanzierung', 'claims', 'DROP', 'AAR-918 — Legacy'],
  ust_id: ['Finanzierung', 'claim_parties', 'MOVE', 'cp.ust_id'],
  firma_name: ['Finanzierung', 'claim_parties', 'MOVE', 'cp.firma (A3)'],
  brn: ['Finanzierung', 'claims', 'DUP', 'auf claims'],

  // --- Reminder / Kommunikation ---
  dokumente_vollstaendig_fuer_phase: ['Reminder', 'claims', 'CLAIMS', 'Dok-Vollstaendigkeit'],
  dokumente_vollstaendig_am_phase: ['Reminder', 'claims', 'CLAIMS', 'Dok-Vollstaendigkeit'],
  dokumente_reminder_whatsapp_letzte_sendung: ['Reminder', 'claims', 'CLAIMS', 'Dok-Reminder'],
  unfallmitteilung_status: ['Reminder', 'claims', 'CLAIMS', 'Unfallmitteilung'],

  // --- Gegnerische VS / Sonstige ---
  vorschaden_mit_vs_abgerechnet: ['Vorschaeden', 'claims', 'DUP', 'auf claims (A10)'],
}

// Prefix-Fallback fuer nicht explizit gelistete Spalten
function fallback(name) {
  if (name.startsWith('eskalation_')) return ['Eskalation', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC']
  if (name.startsWith('vs_')) return ['Regulierung', 'kanzlei_faelle', 'MOVE', 'VS-Workflow']
  if (name.startsWith('ruege_')) return ['Ruege', 'kanzlei_faelle', 'MOVE', 'Ruege-Workflow']
  if (name.startsWith('mietwagen_')) return ['Mietwagen', 'claims', 'CLAIMS', 'Mietwagen']
  if (name.startsWith('gutachten_') || name.startsWith('ocr_')) return ['Gutachten', 'gutachten', 'MOVE', 'Gutachten-Sub-Table']
  if (name.startsWith('fahrzeug_') || name.startsWith('kennzeichen')) return ['Fahrzeug', 'vehicles', 'MOVE', 'vehicles']
  if (name.startsWith('halter_')) return ['Halter', 'claim_parties', 'MOVE', 'cp rolle=halter']
  if (name.startsWith('kunde_')) return ['Kunde', 'claim_parties', 'MOVE', 'cp rolle=geschaedigter']
  if (name.startsWith('gegner_')) return ['Gegner', 'claim_parties', 'MOVE', 'cp rolle=verursacher']
  if (name.startsWith('kanzlei_')) return ['Kanzlei', 'kanzlei_faelle', 'MOVE', 'Kanzlei-LC']
  if (name.startsWith('nachbesichtigung_')) return ['Nachbesichtigung', 'gutachter_termine', 'MOVE', 'Re-Besichtigung']
  if (name.startsWith('vorschaden') || name.startsWith('cardentity_')) return ['Vorschaeden', '?', 'TBD', 'Cardentity-Audit']
  return ['UNKLASSIFIZIERT', '?', 'TBD', 'manuell pruefen']
}

const out = cols.map((c) => {
  const m = M[c.n] || fallback(c.n)
  return { name: c.n, type: c.t, cov: c.cov, onClaims: c.claims, cluster: m[0], home: m[1], verdict: m[2], note: m[3] }
})

// Summary
const byCluster = {}
const byVerdict = {}
const byHome = {}
for (const r of out) {
  byCluster[r.cluster] = (byCluster[r.cluster] || 0) + 1
  byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1
  byHome[r.home] = (byHome[r.home] || 0) + 1
}
console.log('Spalten gesamt:', out.length)
console.log('\nNach Verdikt:'); for (const k of Object.keys(byVerdict).sort()) console.log('  ', k, byVerdict[k])
console.log('\nNach Heimat-Tabelle:'); for (const k of Object.keys(byHome).sort()) console.log('  ', k, byHome[k])
console.log('\nNach Cluster:'); for (const k of Object.keys(byCluster).sort()) console.log('  ', k, byCluster[k])
const unkl = out.filter((r) => r.cluster === 'UNKLASSIFIZIERT')
console.log('\nUNKLASSIFIZIERT (' + unkl.length + '):', unkl.map((r) => r.name).join(', '))

writeFileSync(base + 'cmm44-classified.json', JSON.stringify(out, null, 0))
