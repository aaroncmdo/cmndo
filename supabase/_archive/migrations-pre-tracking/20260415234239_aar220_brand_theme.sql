ALTER TABLE sachverstaendige ADD COLUMN IF NOT EXISTS brand_theme JSONB;
ALTER TABLE organisationen ADD COLUMN IF NOT EXISTS brand_theme JSONB;
COMMENT ON COLUMN sachverstaendige.brand_theme IS 'AAR-220: Theme {primary, secondary, accent, sidebarBg, textOnPrimary, surface}';
COMMENT ON COLUMN organisationen.brand_theme IS 'AAR-220: Theme für Org-Branding';;
