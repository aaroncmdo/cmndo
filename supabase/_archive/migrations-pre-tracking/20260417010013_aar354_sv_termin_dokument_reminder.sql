-- AAR-354: Flag für den 24h-vor-SV-Termin WhatsApp-Reminder.
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS sv_termin_dokument_reminder_gesendet_am TIMESTAMPTZ;

COMMENT ON COLUMN public.faelle.sv_termin_dokument_reminder_gesendet_am IS
  'AAR-354: Zeitpunkt des 24h-vor-SV-Termin WhatsApp-Reminders bei offenen Pflichtdokumenten. NULL = noch nicht gesendet.';;
