-- AAR-220: Vollständiges Theme-System pro SV/Org.
-- brand_theme enthält das komplette Farbschema (primary, secondary, accent,
-- sidebarBg, textOnPrimary, surface). Wird beim Logo-Upload generiert via
-- generateTheme() in src/lib/branding/theme.ts (HSL-Ableitungen aus primary).
-- Legacy brand_primary/brand_secondary/brand_accent bleiben für Backward-Compat
-- bestehen — wer brand_theme nicht hat fällt auf die Legacy-Spalten zurück.

ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS brand_theme JSONB;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS brand_theme JSONB;

COMMENT ON COLUMN sachverstaendige.brand_theme IS
  'AAR-220: Vollständiges Theme-Objekt {primary, secondary, accent, sidebarBg, textOnPrimary, surface} aus Logo-Color-Extraction abgeleitet.';
COMMENT ON COLUMN organisationen.brand_theme IS
  'AAR-220: Vollständiges Theme-Objekt für Org-Branding (vererbt an Sub-SVs ohne eigenes Theme).';
