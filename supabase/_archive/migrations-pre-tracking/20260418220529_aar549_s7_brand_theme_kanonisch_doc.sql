-- AAR-549 S7: brand_theme als kanonische Branding-Quelle dokumentiert.
--
-- Analyse:
--   sachverstaendige hat 4 Branding-Spalten:
--     brand_primary   (text, 7-char HEX)   — Legacy
--     brand_secondary (text, 7-char HEX)   — Legacy
--     brand_accent    (text, 7-char HEX)   — Legacy
--     brand_theme     (jsonb, 25 Tokens)   — Seit AAR-378/AAR-398 kanonisch
--
-- Die 3 Legacy-Felder sind immer synchron mit brand_theme.primary/secondary/
-- accent, weil /api/branding/save sie zusammen schreibt (computeFullTheme()).
--
-- Prod-Daten (Stand 2026-04-19): 2 SVs haben custom Branding, beide haben
-- brand_theme konsistent zu den 3 Legacy-Feldern.
--
-- Full-Drop der 3 Legacy-Felder ist technisch möglich (brand_theme enthält
-- alle Werte), aber risikoreich: 110+ Code-Referenzen in:
--   - src/components/BrandedLayout.tsx (primärer Renderer)
--   - src/app/gutachter/layout.tsx, kunde/termin/[token]/page.tsx (Legacy-Fallback)
--   - src/app/gutachter/profil/branding/page.tsx (Editor-Hydration)
--   - src/app/gutachter/willkommen/page.tsx (Onboarding-Preview)
--   - src/lib/branding/{theme,resolve-theme}.ts (Tokens-Computation)
--
-- Daher: Full-Drop in separatem Ticket (AAR-549 Follow-Up), hier nur COMMENT
-- als Source-of-Truth-Deklaration. Save-Pfad hält brand_theme + Legacy-3
-- synchron, bis der Drop kommt. Kein Reader-Refactor in diesem Commit.

COMMENT ON COLUMN sachverstaendige.brand_theme IS
  'Branding-Tokens (jsonb, 25 Keys inkl. primary, secondary, accent, info, success, warning, danger, sidebarBg etc.). Kanonische Quelle seit AAR-378. brand_primary/secondary/accent sind redundante Legacy-Spiegel und werden via /api/branding/save synchron gehalten — Full-Drop in AAR-549 Follow-Up geplant.';

COMMENT ON COLUMN sachverstaendige.brand_primary IS
  'DEPRECATED (AAR-549 S7): Legacy-Feld, wird synchron aus brand_theme.primary gespiegelt. Nicht für Neuentwicklung verwenden — brand_theme ist kanonisch.';

COMMENT ON COLUMN sachverstaendige.brand_secondary IS
  'DEPRECATED (AAR-549 S7): Legacy-Feld, wird synchron aus brand_theme.secondary gespiegelt. Nicht für Neuentwicklung verwenden — brand_theme ist kanonisch.';

COMMENT ON COLUMN sachverstaendige.brand_accent IS
  'DEPRECATED (AAR-549 S7): Legacy-Feld, wird synchron aus brand_theme.accent gespiegelt. Nicht für Neuentwicklung verwenden — brand_theme ist kanonisch.';;
