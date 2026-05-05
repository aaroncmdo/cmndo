-- CMM-41: KB-Eskalations-Marker fuer Re-Termin-Cron.
--
-- Wenn der SV einen No-Show meldet (CMM-39) und der Kunde nicht innerhalb
-- 48h ueber den Re-Termin-Link reagiert (CMM-40 setzt re_termin_token_
-- eingelaufen_am), eskaliert ein stuendlicher Cron an den KB. Diese Spalte
-- ist der Idempotenz-Marker — wird einmal gesetzt, blockiert weitere
-- Eskalations-Mitteilungen (genauso wie verlegung_eskalation_an_kb_an in
-- AAR-864).

ALTER TABLE public.faelle
  ADD COLUMN IF NOT EXISTS re_termin_eskalation_an_kb_am TIMESTAMPTZ;

COMMENT ON COLUMN public.faelle.re_termin_eskalation_an_kb_am IS
  'CMM-41: Zeitpunkt der KB-Eskalation per cron/re-termin-eskalation. NULL = noch nicht eskaliert. Idempotenz-Marker — verhindert doppelte Mitteilungen.';
