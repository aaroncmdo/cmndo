-- AAR-183: Smart Channel Router — bevorzugter_kanal auf leads + faelle
-- speichert welcher Kanal zuletzt erfolgreich war (whatsapp/sms/email).
-- Twilio Content API rendert EIN Template für WA + SMS — dieselbe ContentSid
-- funktioniert beim Senden an `whatsapp:+49...` als WA, beim Senden an
-- `+49...` als SMS. Der Router probiert also nicht verschiedene Templates,
-- sondern denselben Content via zwei To-Adressen.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS bevorzugter_kanal TEXT;
ALTER TABLE faelle ADD COLUMN IF NOT EXISTS bevorzugter_kanal TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_bevorzugter_kanal_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_bevorzugter_kanal_check
      CHECK (bevorzugter_kanal IS NULL OR bevorzugter_kanal = ANY (ARRAY[
        'whatsapp'::text, 'sms'::text, 'email'::text
      ]));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'faelle_bevorzugter_kanal_check'
  ) THEN
    ALTER TABLE faelle ADD CONSTRAINT faelle_bevorzugter_kanal_check
      CHECK (bevorzugter_kanal IS NULL OR bevorzugter_kanal = ANY (ARRAY[
        'whatsapp'::text, 'sms'::text, 'email'::text
      ]));
  END IF;
END $$;

COMMENT ON COLUMN leads.bevorzugter_kanal IS
  'AAR-183: Letzter erfolgreicher Kanal — wird als Primary beim nächsten Send genutzt.';
COMMENT ON COLUMN faelle.bevorzugter_kanal IS
  'AAR-183: Letzter erfolgreicher Kanal — wird als Primary beim nächsten Send genutzt.';
