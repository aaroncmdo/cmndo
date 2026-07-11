-- Slice-4: Marketing-Cache (Teil) retired. marketing_quelle + marketing_provision_status sind tot
-- (0 prod-Daten, 0 Code-Reader, 0 Writer, 0 View-Dependency nach slice4_vclaimbase_null_cache_refs).
-- marketing_provision bleibt vorerst BEWUSST stehen: fall-finanzen.ts liest die Spalte prod-seitig noch
-- direkt (Reader-Prep-PR #4102 -> staging, noch nicht deployt). View-Projektion ist bereits NULL;
-- Column-Drop folgt nach dem #4102-Deploy.
ALTER TABLE public.claims
  DROP COLUMN marketing_quelle,
  DROP COLUMN marketing_provision_status;
