-- AAR: Morgen-Erinnerung-Flag für gutachter_termine.
-- Cron /api/cron/termin-morgen-erinnerung läuft täglich 07:00 Berliner Zeit
-- und sendet am Termintag morgens eine WA an den Kunden.
-- Flag verhindert Doppel-Sends bei Cron-Restart.

ALTER TABLE gutachter_termine
  ADD COLUMN IF NOT EXISTS erinnerung_morgen_gesendet BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN gutachter_termine.erinnerung_morgen_gesendet IS
  'Morgen-Erinnerung am Termintag (07:00) an Kunden gesendet. Verhindert Duplikate bei Cron-Restart.';
