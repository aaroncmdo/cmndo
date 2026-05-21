-- CMM-44 SP-D — welche der 23 ADD-Ziel-Spalten sind schon auf gutachter_termine?
-- Erwartung Baseline: alle 23 = MISSING. (Die 2 DUP-Spalten geschaetzte_fahrzeit_min /
-- gcal_event_id sind NICHT in der Liste — ihre GT-Zwillinge geschaetzte_fahrtzeit_min /
-- google_event_id existieren bereits → Reader-Switch, kein ADD.)
WITH cols(c) AS (VALUES
 ('besichtigungsort_adresse'),('besichtigungsort_lat'),('besichtigungsort_lng'),('besichtigungsort_place_id'),
 ('besichtigungsort_notiz'),('geschaetzte_fahrdistanz_km'),('termin_erinnerung_5min_gesendet'),
 ('sv_termin_dokument_reminder_gesendet_am'),('losfahren_erinnerung_gesendet'),('wunschtermin'),
 ('no_show_gemeldet_am'),('re_termin_token'),('re_termin_token_eingelaufen_am'),('re_termin_eskalation_an_kb_am'),
 ('nachbesichtigung_status'),('nachbesichtigung_angefordert_am'),('nachbesichtigung_termin_datum'),
 ('nachbesichtigung_konfrontation'),('nachbesichtigung_ergebnis'),('nachbesichtigung_kunde_termin_vorschlaege'),
 ('nachbesichtigung_kunde_termin_eingereicht_am'),('nachbesichtigung_sv_konfrontation_gewuenscht'),
 ('nachbesichtigung_sv_termin_vereinbart_am'))
SELECT cols.c AS k,
  (CASE WHEN gt.column_name IS NOT NULL THEN 'ON_GT(' || gt.data_type || ')' ELSE 'MISSING' END) AS v
FROM cols LEFT JOIN information_schema.columns gt
  ON gt.table_schema='public' AND gt.table_name='gutachter_termine' AND gt.column_name=cols.c
ORDER BY cols.c;
