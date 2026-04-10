-- KFZ-181: Spalten fuer die 4 neuen WhatsApp-Trigger (24-27)
ALTER TABLE gutachter_termine ADD COLUMN IF NOT EXISTS verspaetung_minuten INTEGER;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS dokumente_reminder_whatsapp_letzte_sendung TIMESTAMPTZ;
ALTER TABLE abrechnungen ADD COLUMN IF NOT EXISTS whatsapp_gesendet_am TIMESTAMPTZ;
