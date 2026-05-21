-- CMM-44 SP-D PR1 -- ADD + Backfill (23 columns, rein additiv)
-- ADD+backfill only; view-repoint deferred (PR2-gated on SP-G2 PR2 #1525 staging-merge).
-- faelle columns stay alive (die in Phase 6 with DROP TABLE faelle).
-- After apply: npx supabase migration repair --status applied 20260521133938

BEGIN;

-- ============================================================
-- Block 1: ADD 23 columns to gutachter_termine
-- Types/defaults measured live from information_schema 2026-05-21.
-- All columns are nullable on faelle (is_nullable=YES), mirrored here.
-- 3 booleans have DEFAULT false on faelle: losfahren_erinnerung_gesendet,
--   nachbesichtigung_konfrontation, termin_erinnerung_5min_gesendet.
-- nachbesichtigung_sv_konfrontation_gewuenscht: bool nullable, no default.
-- nachbesichtigung_status: text nullable, DEFAULT 'nicht-angefordert'.
-- nachbesichtigung_kunde_termin_vorschlaege: jsonb nullable, DEFAULT '[]'.
-- ============================================================

-- Besichtigungsort cluster (5 cols)
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS besichtigungsort_adresse            text,
  ADD COLUMN IF NOT EXISTS besichtigungsort_lat                numeric,
  ADD COLUMN IF NOT EXISTS besichtigungsort_lng                numeric,
  ADD COLUMN IF NOT EXISTS besichtigungsort_place_id           text,
  ADD COLUMN IF NOT EXISTS besichtigungsort_notiz              text;

-- Routing (1 col)
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS geschaetzte_fahrdistanz_km          numeric;

-- Reminder cluster (3 cols -- booleans DEFAULT false mirror faelle; timestamp nullable)
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS termin_erinnerung_5min_gesendet         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS losfahren_erinnerung_gesendet           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sv_termin_dokument_reminder_gesendet_am timestamptz;

-- Scheduling / no-show (2 cols)
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS wunschtermin                        timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_gemeldet_am                 timestamptz;

-- Re-Termin cluster (3 cols)
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS re_termin_token                     uuid,
  ADD COLUMN IF NOT EXISTS re_termin_token_eingelaufen_am      timestamptz,
  ADD COLUMN IF NOT EXISTS re_termin_eskalation_an_kb_am       timestamptz;

-- Nachbesichtigung cluster (9 cols)
ALTER TABLE public.gutachter_termine
  ADD COLUMN IF NOT EXISTS nachbesichtigung_status                         text DEFAULT 'nicht-angefordert',
  ADD COLUMN IF NOT EXISTS nachbesichtigung_angefordert_am                 timestamptz,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_termin_datum                   timestamptz,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_konfrontation                  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_ergebnis                       text,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_kunde_termin_vorschlaege       jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_kunde_termin_eingereicht_am    timestamptz,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_sv_konfrontation_gewuenscht    boolean,
  ADD COLUMN IF NOT EXISTS nachbesichtigung_sv_termin_vereinbart_am        timestamptz;

-- ============================================================
-- Block 2: UPDATE-backfill to the latest termin per claim
-- Targets: gt row with id = (latest by start_zeit DESC NULLS LAST per claim_id).
-- 4 booleans use COALESCE(f.<col>, false) to prevent NULL violating the DEFAULT.
-- Others assigned directly (all nullable; NULL-from-faelle is fine).
-- ============================================================

UPDATE public.gutachter_termine gt SET
  besichtigungsort_adresse                     = f.besichtigungsort_adresse,
  besichtigungsort_lat                         = f.besichtigungsort_lat,
  besichtigungsort_lng                         = f.besichtigungsort_lng,
  besichtigungsort_place_id                    = f.besichtigungsort_place_id,
  besichtigungsort_notiz                       = f.besichtigungsort_notiz,
  geschaetzte_fahrdistanz_km                   = f.geschaetzte_fahrdistanz_km,
  termin_erinnerung_5min_gesendet              = COALESCE(f.termin_erinnerung_5min_gesendet, false),
  losfahren_erinnerung_gesendet                = COALESCE(f.losfahren_erinnerung_gesendet, false),
  sv_termin_dokument_reminder_gesendet_am      = f.sv_termin_dokument_reminder_gesendet_am,
  wunschtermin                                 = f.wunschtermin,
  no_show_gemeldet_am                          = f.no_show_gemeldet_am,
  re_termin_token                              = f.re_termin_token,
  re_termin_token_eingelaufen_am               = f.re_termin_token_eingelaufen_am,
  re_termin_eskalation_an_kb_am                = f.re_termin_eskalation_an_kb_am,
  nachbesichtigung_status                      = f.nachbesichtigung_status,
  nachbesichtigung_angefordert_am              = f.nachbesichtigung_angefordert_am,
  nachbesichtigung_termin_datum                = f.nachbesichtigung_termin_datum,
  nachbesichtigung_konfrontation               = COALESCE(f.nachbesichtigung_konfrontation, false),
  nachbesichtigung_ergebnis                    = f.nachbesichtigung_ergebnis,
  nachbesichtigung_kunde_termin_vorschlaege    = f.nachbesichtigung_kunde_termin_vorschlaege,
  nachbesichtigung_kunde_termin_eingereicht_am = f.nachbesichtigung_kunde_termin_eingereicht_am,
  nachbesichtigung_sv_konfrontation_gewuenscht = f.nachbesichtigung_sv_konfrontation_gewuenscht,
  nachbesichtigung_sv_termin_vereinbart_am     = f.nachbesichtigung_sv_termin_vereinbart_am
FROM public.faelle f
WHERE gt.claim_id = f.claim_id
  AND gt.id = (SELECT x.id FROM public.gutachter_termine x
               WHERE x.claim_id = f.claim_id ORDER BY x.start_zeit DESC NULLS LAST LIMIT 1);

COMMIT;
