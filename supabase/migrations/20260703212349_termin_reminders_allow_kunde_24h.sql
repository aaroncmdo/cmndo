-- Reminder-Konsolidierung: kunde_24h als 4. Reminder-Typ zulassen.
-- send-reminders (termin_reminders-Queue) wird alleiniger Sender aller
-- Kunden-/SV-Termin-Reminder; der bisherige termin-erinnerungen-Scan (der die
-- 24h-Kunden-WA schickte) wird auf den 48h-Pflichtdokumente-Check reduziert.
-- kunde_24h = 24h-vor-Termin-Erinnerung, jetzt event-driven aus der Queue.
-- Erweitern eines CHECK (mehr erlaubte Werte) ist rueckwaertskompatibel.
ALTER TABLE public.termin_reminders DROP CONSTRAINT termin_reminders_reminder_typ_check;
ALTER TABLE public.termin_reminders ADD CONSTRAINT termin_reminders_reminder_typ_check
  CHECK (reminder_typ = ANY (ARRAY['kunde_24h'::text, 'kunde_morgen'::text, 'kunde_1h'::text, 'sv_route'::text]));
