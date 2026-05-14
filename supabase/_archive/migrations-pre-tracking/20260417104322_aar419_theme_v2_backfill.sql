-- AAR-419: Theme-Schema V2 Backfill
UPDATE sachverstaendige
SET brand_theme = jsonb_build_object('version', 2, 'migrated_from_v1', true) || brand_theme
WHERE brand_theme IS NOT NULL
  AND (brand_theme->>'version') IS NULL;

UPDATE organisationen
SET brand_theme = jsonb_build_object('version', 2, 'migrated_from_v1', true) || brand_theme
WHERE brand_theme IS NOT NULL
  AND (brand_theme->>'version') IS NULL;

COMMENT ON COLUMN sachverstaendige.brand_theme IS
  'JSONB-Whitelabel-Theme. V1 (AAR-220): 6 Tokens {primary, secondary, accent, sidebarBg, textOnPrimary, surface}. V2 (AAR-419): 24 Farbtokens + {contrastSafe, version}. V1-Records werden beim Read via hydrateTheme() lazy auf V2 erweitert. Ein Record gilt als V2-nativ wenn version=2 gesetzt ist.';

COMMENT ON COLUMN organisationen.brand_theme IS
  'JSONB-Whitelabel-Theme. Siehe sachverstaendige.brand_theme für Schema. Büro-Level-Theme wird an Sub-SVs vererbt (KFZ-157).';;
