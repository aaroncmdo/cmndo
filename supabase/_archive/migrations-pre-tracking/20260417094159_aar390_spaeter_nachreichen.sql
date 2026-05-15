ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS spaeter_nachreichen_markiert_am TIMESTAMPTZ;

COMMENT ON COLUMN public.pflichtdokumente.spaeter_nachreichen_markiert_am IS
  'AAR-390: Zeitpunkt an dem der Kunde den Slot auf „später nachreichen" gesetzt hat. Verhindert nicht die Pflicht, dedupliziert aber Reminder-Versand für 48h.';;
