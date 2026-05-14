-- AAR-316 W0: Sprache des Kunden auf leads/faelle/flow_links.
-- Erdem schätzt >50% seiner Kunden sprechen nicht gut Deutsch.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sprache text DEFAULT 'de';
ALTER TABLE faelle
  ADD COLUMN IF NOT EXISTS sprache text DEFAULT 'de';
ALTER TABLE flow_links
  ADD COLUMN IF NOT EXISTS sprache text DEFAULT 'de';

-- CHECK-Constraint auf die 7 erlaubten Werte
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_sprache_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_sprache_check
  CHECK (sprache IN ('de','tr','ar','ru','pl','en','other'));

ALTER TABLE faelle
  DROP CONSTRAINT IF EXISTS faelle_sprache_check;
ALTER TABLE faelle
  ADD CONSTRAINT faelle_sprache_check
  CHECK (sprache IN ('de','tr','ar','ru','pl','en','other'));

ALTER TABLE flow_links
  DROP CONSTRAINT IF EXISTS flow_links_sprache_check;
ALTER TABLE flow_links
  ADD CONSTRAINT flow_links_sprache_check
  CHECK (sprache IN ('de','tr','ar','ru','pl','en','other'));

COMMENT ON COLUMN leads.sprache IS 'AAR-316: ISO-Code der Kundensprache — DE Standard. Werte: de/tr/ar/ru/pl/en/other.';
COMMENT ON COLUMN faelle.sprache IS 'AAR-316: Aus leads.sprache übernommen — steuert Portal-Übersetzungen.';
COMMENT ON COLUMN flow_links.sprache IS 'AAR-316: Aus leads.sprache übernommen — steuert FlowLink-Übersetzungen.';;
