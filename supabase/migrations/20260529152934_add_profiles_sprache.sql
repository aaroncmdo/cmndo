-- Portal-i18n Welle 1 (F-10): nutzerbasierte Locale-Persistenz.
-- nullable + kein Default -> bestehende Nutzer behalten Cookie/de-Fallback.
-- Appliziert via Supabase-Plugin apply_migration am 2026-05-29 (AGENTS.md Regel 2).
-- Getrackte Version: 20260529152934 (Dateiname == Version, Twin-Drift-Schutz).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sprache text;

-- 2026-07-04: idempotent gemacht (DROP IF EXISTS vor ADD). Der Constraint ist bereits in der
-- Baseline 00000000000000 (Stand 2026-05-30, pg_dump) enthalten; die frische Supabase-Preview
-- wendet Baseline + diese Migration an -> ohne DROP warf das ADD SQLSTATE 42710 "already exists"
-- und brach die Preview jedes Migrations-PRs (systemisches Rauschen, nicht feature-spezifisch).
-- Prod unveraendert: Constraint existiert dort korrekt, die Migration wird NICHT neu appliziert;
-- Dateiname == getrackte Version bleibt -> kein Twin-Drift (AGENTS.md Regel 2). Ergebnis identisch.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_sprache_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sprache_check
  CHECK (sprache IS NULL OR sprache IN ('de','en','tr','ar','ru','pl'));

COMMENT ON COLUMN public.profiles.sprache IS
  'Bevorzugte Portal-Sprache (ISO-639-1, 6 Locales). NULL -> Cookie/DEFAULT_LOCALE-Fallback. App-SSoT, siehe _specs/portal-i18n.';
