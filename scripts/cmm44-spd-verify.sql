-- CMM-44 SP-D — Verify Script
-- Run after migration is applied (with supabase migration repair --status applied <version>).
-- Expected: spd_added_on_gt = 23

SELECT 'spd_added_on_gt' AS k, (SELECT count(*)::text FROM information_schema.columns
  WHERE table_schema='public' AND table_name='gutachter_termine' AND column_name IN (
   'besichtigungsort_adresse','besichtigungsort_lat','besichtigungsort_lng','besichtigungsort_place_id',
   'besichtigungsort_notiz','geschaetzte_fahrdistanz_km','termin_erinnerung_5min_gesendet',
   'sv_termin_dokument_reminder_gesendet_am','losfahren_erinnerung_gesendet','wunschtermin','no_show_gemeldet_am',
   're_termin_token','re_termin_token_eingelaufen_am','re_termin_eskalation_an_kb_am','nachbesichtigung_status',
   'nachbesichtigung_angefordert_am','nachbesichtigung_termin_datum','nachbesichtigung_konfrontation',
   'nachbesichtigung_ergebnis','nachbesichtigung_kunde_termin_vorschlaege','nachbesichtigung_kunde_termin_eingereicht_am',
   'nachbesichtigung_sv_konfrontation_gewuenscht','nachbesichtigung_sv_termin_vereinbart_am')) AS v;
