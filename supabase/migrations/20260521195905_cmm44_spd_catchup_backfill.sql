-- CMM-44 SP-D PR3 — idempotenter Catch-up-Backfill (gutachter_termine <- faelle, aktuellster Termin).
-- Faengt faelle-Writes aus dem Fenster PR1-Apply -> #1529-prod-Deploy. COALESCE: bestehende
-- gt-Werte gewinnen, faelle fuellt nur gt-NULL-Luecken (kein Ueberschreiben). Additiv, idempotent.
-- Die 2 DUP-Spalten (geschaetzte_fahrzeit_min/gcal_event_id) wurden nie auf gt addiert -> kein Catch-up.
-- Nach Apply: npx supabase migration repair --status applied 20260521195905
BEGIN;
UPDATE public.gutachter_termine gt SET
  besichtigungsort_adresse                     = COALESCE(gt.besichtigungsort_adresse, f.besichtigungsort_adresse),
  besichtigungsort_lat                         = COALESCE(gt.besichtigungsort_lat, f.besichtigungsort_lat),
  besichtigungsort_lng                         = COALESCE(gt.besichtigungsort_lng, f.besichtigungsort_lng),
  besichtigungsort_place_id                    = COALESCE(gt.besichtigungsort_place_id, f.besichtigungsort_place_id),
  besichtigungsort_notiz                       = COALESCE(gt.besichtigungsort_notiz, f.besichtigungsort_notiz),
  geschaetzte_fahrdistanz_km                   = COALESCE(gt.geschaetzte_fahrdistanz_km, f.geschaetzte_fahrdistanz_km),
  termin_erinnerung_5min_gesendet              = COALESCE(gt.termin_erinnerung_5min_gesendet, f.termin_erinnerung_5min_gesendet),
  sv_termin_dokument_reminder_gesendet_am      = COALESCE(gt.sv_termin_dokument_reminder_gesendet_am, f.sv_termin_dokument_reminder_gesendet_am),
  losfahren_erinnerung_gesendet                = COALESCE(gt.losfahren_erinnerung_gesendet, f.losfahren_erinnerung_gesendet),
  wunschtermin                                 = COALESCE(gt.wunschtermin, f.wunschtermin),
  no_show_gemeldet_am                          = COALESCE(gt.no_show_gemeldet_am, f.no_show_gemeldet_am),
  re_termin_token                              = COALESCE(gt.re_termin_token, f.re_termin_token),
  re_termin_token_eingelaufen_am               = COALESCE(gt.re_termin_token_eingelaufen_am, f.re_termin_token_eingelaufen_am),
  re_termin_eskalation_an_kb_am                = COALESCE(gt.re_termin_eskalation_an_kb_am, f.re_termin_eskalation_an_kb_am),
  nachbesichtigung_status                      = COALESCE(gt.nachbesichtigung_status, f.nachbesichtigung_status),
  nachbesichtigung_angefordert_am              = COALESCE(gt.nachbesichtigung_angefordert_am, f.nachbesichtigung_angefordert_am),
  nachbesichtigung_termin_datum                = COALESCE(gt.nachbesichtigung_termin_datum, f.nachbesichtigung_termin_datum),
  nachbesichtigung_konfrontation               = COALESCE(gt.nachbesichtigung_konfrontation, f.nachbesichtigung_konfrontation),
  nachbesichtigung_ergebnis                    = COALESCE(gt.nachbesichtigung_ergebnis, f.nachbesichtigung_ergebnis),
  nachbesichtigung_kunde_termin_vorschlaege    = COALESCE(gt.nachbesichtigung_kunde_termin_vorschlaege, f.nachbesichtigung_kunde_termin_vorschlaege),
  nachbesichtigung_kunde_termin_eingereicht_am = COALESCE(gt.nachbesichtigung_kunde_termin_eingereicht_am, f.nachbesichtigung_kunde_termin_eingereicht_am),
  nachbesichtigung_sv_konfrontation_gewuenscht = COALESCE(gt.nachbesichtigung_sv_konfrontation_gewuenscht, f.nachbesichtigung_sv_konfrontation_gewuenscht),
  nachbesichtigung_sv_termin_vereinbart_am     = COALESCE(gt.nachbesichtigung_sv_termin_vereinbart_am, f.nachbesichtigung_sv_termin_vereinbart_am)
FROM public.faelle f
WHERE gt.claim_id = f.claim_id
  AND gt.id = (SELECT x.id FROM public.gutachter_termine x WHERE x.claim_id = f.claim_id ORDER BY x.start_zeit DESC NULLS LAST LIMIT 1);
COMMIT;
