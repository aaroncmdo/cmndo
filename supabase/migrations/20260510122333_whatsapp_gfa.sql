-- AAR: WhatsApp-Verfügbarkeit auch auf gutachter_finder_anfragen.
-- gutachter_finder_anfragen sind Pre-Leads aus dem Self-Dispatch-Flow
-- — Dispatch sieht sie zuerst, bevor sie zu einem Lead/Fall konvertiert
-- werden. WA-Status muss schon dort sichtbar sein.

ALTER TABLE gutachter_finder_anfragen
  ADD COLUMN IF NOT EXISTS whatsapp_verfuegbar BOOLEAN,
  ADD COLUMN IF NOT EXISTS whatsapp_geprueft_am TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gutachter_finder_anfragen_whatsapp_geprueft_am
  ON gutachter_finder_anfragen (whatsapp_geprueft_am)
  WHERE whatsapp_geprueft_am IS NOT NULL;

-- Trigger: Phone-Update invalidiert Cache (analog zu leads/profiles)
DROP TRIGGER IF EXISTS gfa_whatsapp_invalidate ON gutachter_finder_anfragen;
CREATE TRIGGER gfa_whatsapp_invalidate
  BEFORE UPDATE OF telefon ON gutachter_finder_anfragen
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_whatsapp_cache_on_phone_change();

COMMENT ON COLUMN gutachter_finder_anfragen.whatsapp_verfuegbar IS
  'Ob die Telefonnummer ein WhatsApp-Konto hat. NULL = noch nie geprüft.';
COMMENT ON COLUMN gutachter_finder_anfragen.whatsapp_geprueft_am IS
  'Letzter erfolgreicher Lookup. Cache-TTL 30 Tage.';
