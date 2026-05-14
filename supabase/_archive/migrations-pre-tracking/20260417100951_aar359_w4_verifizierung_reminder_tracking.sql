ALTER TABLE sachverstaendige
  ADD COLUMN IF NOT EXISTS verifizierung_reminder_7d_gesendet_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verifizierung_frist_ueberschritten_am TIMESTAMPTZ;

COMMENT ON COLUMN public.sachverstaendige.verifizierung_reminder_7d_gesendet_am IS
  'AAR-359 W4: Zeitpunkt an dem die Tag-7-Halbzeit-Erinnerung rausging. NULL = noch nicht gesendet.';
COMMENT ON COLUMN public.sachverstaendige.verifizierung_frist_ueberschritten_am IS
  'AAR-359 W4: Zeitpunkt an dem der Cron den Übergang ausstehend → frist_ueberschritten gemacht hat. Als separate Audit-Spur neben verifizierung_status.';;
