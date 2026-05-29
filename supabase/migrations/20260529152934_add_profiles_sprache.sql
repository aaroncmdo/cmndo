-- Portal-i18n Welle 1 (F-10): nutzerbasierte Locale-Persistenz.
-- nullable + kein Default -> bestehende Nutzer behalten Cookie/de-Fallback.
-- Appliziert via Supabase-Plugin apply_migration am 2026-05-29 (AGENTS.md Regel 2).
-- Getrackte Version: 20260529152934 (Dateiname == Version, Twin-Drift-Schutz).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sprache text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sprache_check
  CHECK (sprache IS NULL OR sprache IN ('de','en','tr','ar','ru','pl'));

COMMENT ON COLUMN public.profiles.sprache IS
  'Bevorzugte Portal-Sprache (ISO-639-1, 6 Locales). NULL -> Cookie/DEFAULT_LOCALE-Fallback. App-SSoT, siehe _specs/portal-i18n.';
