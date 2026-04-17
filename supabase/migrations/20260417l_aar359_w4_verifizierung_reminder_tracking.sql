-- AAR-359 Welle 4: Dedup-Tracking für den Verifizierungs-Reminder-Cron.
--
-- Der Cron (/api/cron/verifizierung-reminder) läuft täglich und soll
-- - an Tag 7 (nach Anzahlung) eine Reminder-Email an den SV senden
-- - an Tag 14 (Frist abgelaufen) den Status auf frist_ueberschritten setzen
--   und Admin + SV benachrichtigen
--
-- Ohne Dedup würde der Tag-7-Reminder an jedem weiteren Cron-Lauf erneut
-- rausgehen. Ein einzelner Timestamp reicht — der Tag-14-Übergang ist via
-- verifizierung_status = 'frist_ueberschritten' selbst idempotent (nach
-- dem ersten Übergang matcht der Cron-Filter nicht mehr).

ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS verifizierung_reminder_7d_gesendet_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifizierung_frist_ueberschritten_am TIMESTAMPTZ;

COMMENT ON COLUMN public.sachverstaendige.verifizierung_reminder_7d_gesendet_am IS
  'AAR-359 W4: Zeitpunkt an dem die Tag-7-Halbzeit-Erinnerung rausging. NULL = noch nicht gesendet.';
COMMENT ON COLUMN public.sachverstaendige.verifizierung_frist_ueberschritten_am IS
  'AAR-359 W4: Zeitpunkt an dem der Cron den Übergang ausstehend → frist_ueberschritten gemacht hat. Als separate Audit-Spur neben verifizierung_status.';
