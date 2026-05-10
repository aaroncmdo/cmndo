-- AAR: WhatsApp-Verfügbarkeit cachen auf leads + profiles.
--
-- Wir checken pro Telefonnummer ob sie ein WA-Konto hat (via Baileys-
-- Service /check). Ergebnis wird gecached:
--   - geprueft_am NULL → noch nie geprüft (Background-Job triggern)
--   - geprueft_am älter als 30 Tage → re-check
--   - sonst: Cache-Hit, kein API-Call
--
-- Cache-Invalidation passiert beim Phone-Update via Trigger
-- (siehe unten — setzt geprueft_am auf NULL zurück, sodass die nächste
-- Lese-Operation einen Re-Check triggern wird).

-- ─── leads ────────────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS whatsapp_verfuegbar BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_geprueft_am TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_geprueft_am
  ON leads (whatsapp_geprueft_am) WHERE whatsapp_geprueft_am IS NOT NULL;

-- ─── profiles ─────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS whatsapp_verfuegbar BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_geprueft_am TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_whatsapp_geprueft_am
  ON profiles (whatsapp_geprueft_am) WHERE whatsapp_geprueft_am IS NOT NULL;

-- ─── Auto-Invalidation bei Phone-Update ──────────────────────────
-- Trigger setzt whatsapp_geprueft_am=NULL wenn die Telefonnummer
-- sich ändert. Nächste Lese-Operation triggert dann den Re-Check.

CREATE OR REPLACE FUNCTION invalidate_whatsapp_cache_on_phone_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.telefon IS DISTINCT FROM OLD.telefon THEN
    NEW.whatsapp_verfuegbar := NULL;
    NEW.whatsapp_geprueft_am := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_whatsapp_invalidate ON leads;
CREATE TRIGGER leads_whatsapp_invalidate
  BEFORE UPDATE OF telefon ON leads
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_whatsapp_cache_on_phone_change();

DROP TRIGGER IF EXISTS profiles_whatsapp_invalidate ON profiles;
CREATE TRIGGER profiles_whatsapp_invalidate
  BEFORE UPDATE OF telefon ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_whatsapp_cache_on_phone_change();

COMMENT ON COLUMN leads.whatsapp_verfuegbar IS
  'Ob die Telefonnummer ein WhatsApp-Konto hat. NULL = noch nie geprüft. Wird via lib/whatsapp/availability.ts gesetzt + bei Phone-Update auto-invalidiert.';
COMMENT ON COLUMN leads.whatsapp_geprueft_am IS
  'Letzter erfolgreicher Lookup. Cache-TTL 30 Tage — danach Re-Check.';
COMMENT ON COLUMN profiles.whatsapp_verfuegbar IS
  'Ob die Telefonnummer ein WhatsApp-Konto hat. NULL = noch nie geprüft.';
COMMENT ON COLUMN profiles.whatsapp_geprueft_am IS
  'Letzter erfolgreicher Lookup. Cache-TTL 30 Tage.';
