-- Migration: twofa_aktiviert Default auf false + gesperrte Mitarbeiter-Accounts entsperren
--
-- Problem: profiles.twofa_aktiviert hatte DEFAULT true. createMitarbeiter() setzt den Wert
-- nicht explizit. Alle intern angelegten Accounts hatten twofa_aktiviert=true,
-- aber TWILIO_VERIFY_SERVICE_SID fehlt in Env -> 2FA-Seite wirft unbehandelte Exception
-- -> Benutzer steckt auf /login/2fa fest ohne Fehlermeldung.
--
-- Fix 1: Default auf false
ALTER TABLE profiles ALTER COLUMN twofa_aktiviert SET DEFAULT false;

-- Fix 2: Gesperrte Mitarbeiter entsperren (twofa=true aber kein twofa_telefon = nie konfiguriert)
UPDATE profiles
SET
  twofa_aktiviert = false,
  twofa_email_aktiviert = false,
  updated_at = now()
WHERE
  twofa_aktiviert = true
  AND twofa_telefon IS NULL
  AND rolle IN ('admin', 'dispatch', 'kundenbetreuer', 'leadbearbeiter');

COMMENT ON COLUMN profiles.twofa_aktiviert IS
  '2FA per SMS aktiv. DEFAULT false — nur true wenn User Telefonnummer verifiziert hat.';
