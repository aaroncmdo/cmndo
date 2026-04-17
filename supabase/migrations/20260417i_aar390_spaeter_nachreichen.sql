-- AAR-390: Pflichtdokumente-Nachtrag „Später nachreichen"
--
-- Kunde kann einen Pflichtdokumente-Slot explizit als „später nachreichen"
-- markieren. Das schaltet den Slot nicht frei (pflicht bleibt pflicht und
-- blockiert weiterhin die W2-Freigabe), dedupliziert aber Reminder-Mails/
-- WhatsApps — ein Slot der gerade erst markiert wurde triggert 48h lang
-- keine neue Erinnerung.

ALTER TABLE pflichtdokumente
  ADD COLUMN IF NOT EXISTS spaeter_nachreichen_markiert_am TIMESTAMPTZ;

COMMENT ON COLUMN public.pflichtdokumente.spaeter_nachreichen_markiert_am IS
  'AAR-390: Zeitpunkt an dem der Kunde den Slot auf „später nachreichen" gesetzt hat. Verhindert nicht die Pflicht, dedupliziert aber Reminder-Versand für 48h.';
