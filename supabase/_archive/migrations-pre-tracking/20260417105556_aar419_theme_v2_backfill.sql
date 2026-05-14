-- AAR-419 (Whitelabeling V2 Child 1): Backfill für V1 → V2 Theme-Migration
-- 
-- Markiert bestehende V1 brand_theme Records (6 Keys) mit Schema-Version-Info,
-- damit der Code beim Read erkennt welche Records Lazy-Migration via
-- themeFromLegacy() brauchen. Die eigentliche Expansion auf 25 Keys passiert
-- im Application-Layer (AAR-419 Child 1), nicht hier in SQL.
--
-- Idempotent: Records die bereits `_schema_version` haben werden übersprungen.
--
-- Stand 17.04.2026: 0 Records mit use_custom_branding=true — der Backfill
-- greift erst wenn Partner-SVs mit V1-Branding angelegt werden bevor AAR-419
-- live ist.

UPDATE sachverstaendige
SET brand_theme = jsonb_build_object(
  '_schema_version', 1,
  '_needs_v2_expansion', true,
  '_migrated_at', null
) || brand_theme
WHERE use_custom_branding = true 
  AND brand_theme IS NOT NULL 
  AND NOT (brand_theme ? '_schema_version');

-- Analog für organisationen (Büro-Branding, AAR-220 Sub-SV-Vererbung)
UPDATE organisationen
SET brand_theme = jsonb_build_object(
  '_schema_version', 1,
  '_needs_v2_expansion', true,
  '_migrated_at', null
) || brand_theme
WHERE use_custom_branding = true 
  AND brand_theme IS NOT NULL 
  AND NOT (brand_theme ? '_schema_version');;
