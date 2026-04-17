-- AAR-354: Flag für den 24h-vor-SV-Termin WhatsApp-Reminder.
-- Unterscheidet sich bewusst von dokumente_reminder_whatsapp_letzte_sendung
-- (KFZ-181, Legacy 48h-Takt), damit der SV-Termin-spezifische Reminder
-- auch dann greift wenn vor kurzem schon ein allgemeiner Dok-Reminder ging.
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS sv_termin_dokument_reminder_gesendet_am TIMESTAMPTZ;

COMMENT ON COLUMN public.faelle.sv_termin_dokument_reminder_gesendet_am IS
  'AAR-354: Zeitpunkt des 24h-vor-SV-Termin WhatsApp-Reminders bei offenen Pflichtdokumenten. NULL = noch nicht gesendet. Wird nicht pro Termin zurückgesetzt — ein Reminder pro Fall reicht.';
