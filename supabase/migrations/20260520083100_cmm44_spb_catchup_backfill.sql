-- CMM-44 SP-B PR3 — Catch-up-Backfill (additiv, kein DROP)
--
-- Fängt SP-B-Spalten ein, die zwischen PR1-Initial-Backfill und PR2a/b/c-
-- Writer-Deploy noch auf faelle geschrieben wurden, claims-seitig aber leer
-- blieben. claims ist SSoT.
--
-- WICHTIG — Abweichung von Plan-Wortlaut „identischer UPDATE wie PR1 Block 2":
-- Plan sagt naked `SET <col> = f.<col>`. Das ist für PR3 nicht sicher, weil PR2a/b/c
-- inzwischen claims-Writer aktiv hatten — ein naked UPDATE wuerde ggf. neuere
-- claims-Werte mit aelteren faelle-Werten ueberschreiben. Daher pro Spalte ein
-- IS-NULL-guardetes UPDATE (SP-A2-Pattern): nur claims-NULL-Luecken werden aus
-- faelle gefuellt. Idempotent, kollisionsfrei, semantisch wirklich ein „Catch-up".
--
-- 64 UPDATEs, einer pro Spalte. Faelle behaelt die Daten bis Phase 6 (DROP TABLE).
--
-- Nach Apply: npx supabase migration repair --status applied 20260520083100
-- Ticket: CMM-44 / Sub-Projekt SP-B / Plan Task 6 / Spec §4 PR3

BEGIN;

UPDATE public.claims c SET makler_id = f.makler_id FROM public.faelle f
  WHERE f.claim_id = c.id AND c.makler_id IS NULL AND f.makler_id IS NOT NULL;
UPDATE public.claims c SET betreuungspaket = f.betreuungspaket FROM public.faelle f
  WHERE f.claim_id = c.id AND c.betreuungspaket IS NULL AND f.betreuungspaket IS NOT NULL;
UPDATE public.claims c SET notizen = f.notizen FROM public.faelle f
  WHERE f.claim_id = c.id AND c.notizen IS NULL AND f.notizen IS NOT NULL;
UPDATE public.claims c SET prioritaet = f.prioritaet FROM public.faelle f
  WHERE f.claim_id = c.id AND c.prioritaet IS NULL AND f.prioritaet IS NOT NULL;
UPDATE public.claims c SET onboarding_complete = f.onboarding_complete FROM public.faelle f
  WHERE f.claim_id = c.id AND c.onboarding_complete IS NULL AND f.onboarding_complete IS NOT NULL;
UPDATE public.claims c SET status_changed_at = f.status_changed_at FROM public.faelle f
  WHERE f.claim_id = c.id AND c.status_changed_at IS NULL AND f.status_changed_at IS NOT NULL;
UPDATE public.claims c SET google_review_gesendet = f.google_review_gesendet FROM public.faelle f
  WHERE f.claim_id = c.id AND c.google_review_gesendet IS NULL AND f.google_review_gesendet IS NOT NULL;
UPDATE public.claims c SET datenschutz_akzeptiert = f.datenschutz_akzeptiert FROM public.faelle f
  WHERE f.claim_id = c.id AND c.datenschutz_akzeptiert IS NULL AND f.datenschutz_akzeptiert IS NOT NULL;
UPDATE public.claims c SET datenschutz_akzeptiert_am = f.datenschutz_akzeptiert_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.datenschutz_akzeptiert_am IS NULL AND f.datenschutz_akzeptiert_am IS NOT NULL;
UPDATE public.claims c SET interne_notizen = f.interne_notizen FROM public.faelle f
  WHERE f.claim_id = c.id AND c.interne_notizen IS NULL AND f.interne_notizen IS NOT NULL;
UPDATE public.claims c SET ist_aktiv = f.ist_aktiv FROM public.faelle f
  WHERE f.claim_id = c.id AND c.ist_aktiv IS NULL AND f.ist_aktiv IS NOT NULL;
UPDATE public.claims c SET deaktiviert_am = f.deaktiviert_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.deaktiviert_am IS NULL AND f.deaktiviert_am IS NOT NULL;
UPDATE public.claims c SET deaktiviert_grund = f.deaktiviert_grund FROM public.faelle f
  WHERE f.claim_id = c.id AND c.deaktiviert_grund IS NULL AND f.deaktiviert_grund IS NOT NULL;
UPDATE public.claims c SET deaktiviert_notiz = f.deaktiviert_notiz FROM public.faelle f
  WHERE f.claim_id = c.id AND c.deaktiviert_notiz IS NULL AND f.deaktiviert_notiz IS NOT NULL;
UPDATE public.claims c SET szenario = f.szenario FROM public.faelle f
  WHERE f.claim_id = c.id AND c.szenario IS NULL AND f.szenario IS NOT NULL;
UPDATE public.claims c SET service_typ = f.service_typ FROM public.faelle f
  WHERE f.claim_id = c.id AND c.service_typ IS NULL AND f.service_typ IS NOT NULL;
UPDATE public.claims c SET geschlossen_grund = f.geschlossen_grund FROM public.faelle f
  WHERE f.claim_id = c.id AND c.geschlossen_grund IS NULL AND f.geschlossen_grund IS NOT NULL;
UPDATE public.claims c SET bevorzugter_kanal = f.bevorzugter_kanal FROM public.faelle f
  WHERE f.claim_id = c.id AND c.bevorzugter_kanal IS NULL AND f.bevorzugter_kanal IS NOT NULL;
UPDATE public.claims c SET sprache = f.sprache FROM public.faelle f
  WHERE f.claim_id = c.id AND c.sprache IS NULL AND f.sprache IS NOT NULL;
UPDATE public.claims c SET fallakte_angelegt_am = f.fallakte_angelegt_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.fallakte_angelegt_am IS NULL AND f.fallakte_angelegt_am IS NOT NULL;
UPDATE public.claims c SET google_review_prompt_gezeigt_am = f.google_review_prompt_gezeigt_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.google_review_prompt_gezeigt_am IS NULL AND f.google_review_prompt_gezeigt_am IS NOT NULL;
UPDATE public.claims c SET sv_zugewiesen_am = f.sv_zugewiesen_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.sv_zugewiesen_am IS NULL AND f.sv_zugewiesen_am IS NOT NULL;
UPDATE public.claims c SET kundenbetreuer_fallback_flag = f.kundenbetreuer_fallback_flag FROM public.faelle f
  WHERE f.claim_id = c.id AND c.kundenbetreuer_fallback_flag IS NULL AND f.kundenbetreuer_fallback_flag IS NOT NULL;
UPDATE public.claims c SET kundenbetreuer_zugewiesen_am = f.kundenbetreuer_zugewiesen_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.kundenbetreuer_zugewiesen_am IS NULL AND f.kundenbetreuer_zugewiesen_am IS NOT NULL;
UPDATE public.claims c SET eskaliert_an_admin_id = f.eskaliert_an_admin_id FROM public.faelle f
  WHERE f.claim_id = c.id AND c.eskaliert_an_admin_id IS NULL AND f.eskaliert_an_admin_id IS NOT NULL;
UPDATE public.claims c SET eskaliert_am = f.eskaliert_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.eskaliert_am IS NULL AND f.eskaliert_am IS NOT NULL;
UPDATE public.claims c SET eskaliert_grund = f.eskaliert_grund FROM public.faelle f
  WHERE f.claim_id = c.id AND c.eskaliert_grund IS NULL AND f.eskaliert_grund IS NOT NULL;
UPDATE public.claims c SET abtretung_pdf = f.abtretung_pdf FROM public.faelle f
  WHERE f.claim_id = c.id AND c.abtretung_pdf IS NULL AND f.abtretung_pdf IS NOT NULL;
UPDATE public.claims c SET vollmacht_pdf = f.vollmacht_pdf FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_pdf IS NULL AND f.vollmacht_pdf IS NOT NULL;
UPDATE public.claims c SET abtretung_signiert_am = f.abtretung_signiert_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.abtretung_signiert_am IS NULL AND f.abtretung_signiert_am IS NOT NULL;
UPDATE public.claims c SET vollmacht_signiert_am = f.vollmacht_signiert_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_signiert_am IS NULL AND f.vollmacht_signiert_am IS NOT NULL;
UPDATE public.claims c SET sa_unterschrieben = f.sa_unterschrieben FROM public.faelle f
  WHERE f.claim_id = c.id AND c.sa_unterschrieben IS NULL AND f.sa_unterschrieben IS NOT NULL;
UPDATE public.claims c SET sa_unterschrieben_am = f.sa_unterschrieben_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.sa_unterschrieben_am IS NULL AND f.sa_unterschrieben_am IS NOT NULL;
UPDATE public.claims c SET sa_pdf_url = f.sa_pdf_url FROM public.faelle f
  WHERE f.claim_id = c.id AND c.sa_pdf_url IS NULL AND f.sa_pdf_url IS NOT NULL;
UPDATE public.claims c SET sa_unterschrift_url = f.sa_unterschrift_url FROM public.faelle f
  WHERE f.claim_id = c.id AND c.sa_unterschrift_url IS NULL AND f.sa_unterschrift_url IS NOT NULL;
UPDATE public.claims c SET vollmacht_status = f.vollmacht_status FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_status IS NULL AND f.vollmacht_status IS NOT NULL;
UPDATE public.claims c SET vollmacht_geprueft_am = f.vollmacht_geprueft_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_geprueft_am IS NULL AND f.vollmacht_geprueft_am IS NOT NULL;
UPDATE public.claims c SET vollmacht_geprueft_von = f.vollmacht_geprueft_von FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_geprueft_von IS NULL AND f.vollmacht_geprueft_von IS NOT NULL;
UPDATE public.claims c SET vollmacht_pruefung_status = f.vollmacht_pruefung_status FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_pruefung_status IS NULL AND f.vollmacht_pruefung_status IS NOT NULL;
UPDATE public.claims c SET vollmacht_pruefung_begruendung = f.vollmacht_pruefung_begruendung FROM public.faelle f
  WHERE f.claim_id = c.id AND c.vollmacht_pruefung_begruendung IS NULL AND f.vollmacht_pruefung_begruendung IS NOT NULL;
UPDATE public.claims c SET mietwagen_seit_datum = f.mietwagen_seit_datum FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_seit_datum IS NULL AND f.mietwagen_seit_datum IS NOT NULL;
UPDATE public.claims c SET mietwagen_limit_tage = f.mietwagen_limit_tage FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_limit_tage IS NULL AND f.mietwagen_limit_tage IS NOT NULL;
UPDATE public.claims c SET mietwagen_limit_grund = f.mietwagen_limit_grund FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_limit_grund IS NULL AND f.mietwagen_limit_grund IS NOT NULL;
UPDATE public.claims c SET mietwagen_rechnung_vorhanden = f.mietwagen_rechnung_vorhanden FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_rechnung_vorhanden IS NULL AND f.mietwagen_rechnung_vorhanden IS NOT NULL;
UPDATE public.claims c SET mietwagen_rechnung_url = f.mietwagen_rechnung_url FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_rechnung_url IS NULL AND f.mietwagen_rechnung_url IS NOT NULL;
UPDATE public.claims c SET mietwagen_argumentations_puffer = f.mietwagen_argumentations_puffer FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_argumentations_puffer IS NULL AND f.mietwagen_argumentations_puffer IS NOT NULL;
UPDATE public.claims c SET mietwagen_vermieter = f.mietwagen_vermieter FROM public.faelle f
  WHERE f.claim_id = c.id AND c.mietwagen_vermieter IS NULL AND f.mietwagen_vermieter IS NOT NULL;
UPDATE public.claims c SET schadens_hoehe_netto = f.schadens_hoehe_netto FROM public.faelle f
  WHERE f.claim_id = c.id AND c.schadens_hoehe_netto IS NULL AND f.schadens_hoehe_netto IS NOT NULL;
UPDATE public.claims c SET schadens_ursache = f.schadens_ursache FROM public.faelle f
  WHERE f.claim_id = c.id AND c.schadens_ursache IS NULL AND f.schadens_ursache IS NOT NULL;
UPDATE public.claims c SET zeugen_vorhanden = f.zeugen_vorhanden FROM public.faelle f
  WHERE f.claim_id = c.id AND c.zeugen_vorhanden IS NULL AND f.zeugen_vorhanden IS NOT NULL;
UPDATE public.claims c SET bkat_unfallart = f.bkat_unfallart FROM public.faelle f
  WHERE f.claim_id = c.id AND c.bkat_unfallart IS NULL AND f.bkat_unfallart IS NOT NULL;
UPDATE public.claims c SET werkstatt_seit_datum = f.werkstatt_seit_datum FROM public.faelle f
  WHERE f.claim_id = c.id AND c.werkstatt_seit_datum IS NULL AND f.werkstatt_seit_datum IS NOT NULL;
UPDATE public.claims c SET fahrzeug_fahrbereit = f.fahrzeug_fahrbereit FROM public.faelle f
  WHERE f.claim_id = c.id AND c.fahrzeug_fahrbereit IS NULL AND f.fahrzeug_fahrbereit IS NOT NULL;
UPDATE public.claims c SET fahrzeugschaden_beschreibung = f.fahrzeugschaden_beschreibung FROM public.faelle f
  WHERE f.claim_id = c.id AND c.fahrzeugschaden_beschreibung IS NULL AND f.fahrzeugschaden_beschreibung IS NOT NULL;
UPDATE public.claims c SET abrechnungsart_besprochen = f.abrechnungsart_besprochen FROM public.faelle f
  WHERE f.claim_id = c.id AND c.abrechnungsart_besprochen IS NULL AND f.abrechnungsart_besprochen IS NOT NULL;
UPDATE public.claims c SET abrechnungsart_notiz = f.abrechnungsart_notiz FROM public.faelle f
  WHERE f.claim_id = c.id AND c.abrechnungsart_notiz IS NULL AND f.abrechnungsart_notiz IS NOT NULL;
UPDATE public.claims c SET abrechnungsart_besprochen_am = f.abrechnungsart_besprochen_am FROM public.faelle f
  WHERE f.claim_id = c.id AND c.abrechnungsart_besprochen_am IS NULL AND f.abrechnungsart_besprochen_am IS NOT NULL;
UPDATE public.claims c SET unfallmitteilung_status = f.unfallmitteilung_status FROM public.faelle f
  WHERE f.claim_id = c.id AND c.unfallmitteilung_status IS NULL AND f.unfallmitteilung_status IS NOT NULL;
UPDATE public.claims c SET dokumente_vollstaendig_fuer_phase = f.dokumente_vollstaendig_fuer_phase FROM public.faelle f
  WHERE f.claim_id = c.id AND c.dokumente_vollstaendig_fuer_phase IS NULL AND f.dokumente_vollstaendig_fuer_phase IS NOT NULL;
UPDATE public.claims c SET dokumente_vollstaendig_am_phase = f.dokumente_vollstaendig_am_phase FROM public.faelle f
  WHERE f.claim_id = c.id AND c.dokumente_vollstaendig_am_phase IS NULL AND f.dokumente_vollstaendig_am_phase IS NOT NULL;
UPDATE public.claims c SET dokumente_reminder_whatsapp_letzte_sendung = f.dokumente_reminder_whatsapp_letzte_sendung FROM public.faelle f
  WHERE f.claim_id = c.id AND c.dokumente_reminder_whatsapp_letzte_sendung IS NULL AND f.dokumente_reminder_whatsapp_letzte_sendung IS NOT NULL;
UPDATE public.claims c SET zb1_status = f.zb1_status FROM public.faelle f
  WHERE f.claim_id = c.id AND c.zb1_status IS NULL AND f.zb1_status IS NOT NULL;
UPDATE public.claims c SET kanzlei_ansprechpartner_position = f.kanzlei_ansprechpartner_position FROM public.faelle f
  WHERE f.claim_id = c.id AND c.kanzlei_ansprechpartner_position IS NULL AND f.kanzlei_ansprechpartner_position IS NOT NULL;
UPDATE public.claims c SET leasinggeber_informiert = f.leasinggeber_informiert FROM public.faelle f
  WHERE f.claim_id = c.id AND c.leasinggeber_informiert IS NULL AND f.leasinggeber_informiert IS NOT NULL;

COMMIT;
