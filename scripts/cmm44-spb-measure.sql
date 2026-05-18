-- CMM-44 SP-B — Live-DB-Messung der 64 CLAIMS-Verdikt-Spalten (2026-05-18)
-- Reproduzierbar: npx supabase db query --linked --file scripts/cmm44-spb-measure.sql
-- Eine Query (db query liefert nur das letzte Statement) -> ein Result-Set:
--   Zeile 0 = Spalten-Totals faelle/claims, Zeilen 1-64 = SP-B-Spalten-Detail.
-- Drift-Warnung (feedback_information_schema_check): das Phase-1-Mapping ist vom
-- 2026-05-16 — SP-A2/A3 haben seither gedroppt; daher dieser Re-Check vor dem Spec.
WITH spb(col) AS (VALUES
  ('makler_id'),
  ('betreuungspaket'),('notizen'),('prioritaet'),('onboarding_complete'),
  ('status_changed_at'),('google_review_gesendet'),('datenschutz_akzeptiert'),
  ('datenschutz_akzeptiert_am'),('interne_notizen'),('ist_aktiv'),('deaktiviert_am'),
  ('deaktiviert_grund'),('deaktiviert_notiz'),('szenario'),('service_typ'),
  ('geschlossen_grund'),('bevorzugter_kanal'),('sprache'),('fallakte_angelegt_am'),
  ('google_review_prompt_gezeigt_am'),
  ('sv_zugewiesen_am'),('kundenbetreuer_fallback_flag'),('kundenbetreuer_zugewiesen_am'),
  ('eskaliert_an_admin_id'),('eskaliert_am'),('eskaliert_grund'),
  ('schadens_hoehe_netto'),('schadens_ursache'),('zeugen_vorhanden'),('bkat_unfallart'),
  ('zb1_status'),
  ('werkstatt_seit_datum'),('fahrzeug_fahrbereit'),('fahrzeugschaden_beschreibung'),
  ('mietwagen_seit_datum'),('mietwagen_limit_tage'),('mietwagen_limit_grund'),
  ('mietwagen_rechnung_vorhanden'),('mietwagen_rechnung_url'),
  ('mietwagen_argumentations_puffer'),('mietwagen_vermieter'),
  ('abtretung_pdf'),('vollmacht_pdf'),('abtretung_signiert_am'),('vollmacht_signiert_am'),
  ('sa_unterschrieben'),('sa_unterschrieben_am'),('sa_pdf_url'),('sa_unterschrift_url'),
  ('vollmacht_status'),('vollmacht_geprueft_am'),('vollmacht_geprueft_von'),
  ('vollmacht_pruefung_status'),('vollmacht_pruefung_begruendung'),
  ('kanzlei_ansprechpartner_position'),
  ('abrechnungsart_besprochen'),('abrechnungsart_notiz'),('abrechnungsart_besprochen_am'),
  ('leasinggeber_informiert'),
  ('unfallmitteilung_status'),('dokumente_vollstaendig_fuer_phase'),
  ('dokumente_vollstaendig_am_phase'),('dokumente_reminder_whatsapp_letzte_sendung')
)
SELECT 0 AS srt,
  'TOTALS: faelle=' || (SELECT count(*) FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='faelle')
  || ' claims=' || (SELECT count(*) FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='claims')
  || ' | spb-soll=64' AS zeile
UNION ALL
SELECT 1 AS srt,
  rpad(spb.col, 36) || '| udt=' ||
  rpad(COALESCE(f.udt_name, '!! FEHLT auf faelle'), 18) || '| null=' || COALESCE(f.is_nullable, '?') ||
  ' | def=' || COALESCE(f.column_default, '-') ||
  ' | ' || CASE WHEN c.column_name IS NOT NULL
                THEN '!! CLAIMS-KOLLISION (claims.' || c.column_name || ')'
                ELSE 'claims: frei' END AS zeile
FROM spb
LEFT JOIN information_schema.columns f
  ON f.table_schema='public' AND f.table_name='faelle' AND f.column_name=spb.col
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='claims' AND c.column_name=spb.col
ORDER BY srt, zeile;
