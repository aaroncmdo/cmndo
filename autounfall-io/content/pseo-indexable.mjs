// Single Source of Truth für den PSEO-Index-Gate (WP-5).
// Von TS (page.tsx/sitemap.ts) UND dependency-freien .mjs-Scripts (smoke) lesbar.
// Steuert BEIDES: page.tsx robots:{ index } + sitemap.ts pseoRoutes.
//   false = /kfz-unfall/* noindex,follow + NICHT in der Sitemap (Seiten bleiben live/200).
//   true  = indexierbar + in Sitemap — ERST nach unikatem Lokal-Content je Stadt
//           (Duplicate-Jaccard 0,61 dokumentiert), sonst Thin-Content/Doorway-Risiko.
// Cowork 2026-06-16: zurück auf false — die 100 dünnen Hyperlocal-Seiten blähten den
// GSC-„Gefunden – zurzeit nicht indexiert"-Report auf. Substanzieller Städte-Ausbau = v2.
export const PSEO_INDEXABLE = false
