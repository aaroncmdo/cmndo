-- Chat-i18n Phase 2: Cache fuer maschinelle Uebersetzungen von Human-Freitext-
-- Chatnachrichten (Claude haiku). Pro Zielsprache einmal uebersetzt + gecacht:
-- { "en": "...", "tr": "..." }. nachricht bleibt das Original (Quelle); der
-- Renderer zeigt dem Leser die uebersetzte Variante in seiner Sprache + Toggle
-- aufs Original. Additiv + nullable.
ALTER TABLE public.nachrichten
  ADD COLUMN IF NOT EXISTS uebersetzungen jsonb;

COMMENT ON COLUMN public.nachrichten.uebersetzungen IS
  'i18n Phase 2: Cache maschineller Uebersetzungen pro Ziel-Locale ({en,tr,...}). NULL = noch nicht uebersetzt; nachricht ist das Original.';
