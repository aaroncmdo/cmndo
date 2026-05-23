# Sprint-1 Loose-Ends — FAQPage-Konsolidierung + Stream A

**Datum:** 2026-05-23 · **Branch:** `kitta/sprint1-loose-ends` (off clean staging)
Zwei Sprint-1-Reste in einem PR (vermeidet erneutes Multi-PR-Konflikt-Tanzen auf den Content-Routen).

## 1 · FAQPage-Konsolidierung (Revalidierungs-Befund)
**Problem:** Auf Seiten mit schon vorhandener FAQPage (manuell oder Auto-Schema) erzeugte `FaqStems` eine **2. FAQPage** → 2 FAQPage-Knoten/Seite (Google empfiehlt eine).

**Fix:**
- `FaqStems` ist jetzt **visible-only** (kein eigenes `<script>` mehr).
- Neuer Helper **`mergeFaqStemsIntoSchema(schemaStr, stems)`** (jsonld.ts): findet die FAQPage im @graph, hängt die Stems an `mainEntity` (dedupe per Frage); fehlt eine FAQPage, wird **genau eine** ergänzt; try/catch → bei Parse-/Strukturfehler Schema unverändert (nie Bruch).
- `ContentJsonLd` baut die Basis (manual ?? auto ?? articleSchema) und mergt die Stems → **eine FAQPage pro Seite**. Routen reichen `faqStems` durch.
- Unit-Tests (5/5): append+dedupe / add-when-missing / invalid-JSON-safe / empty-safe.

## 2 · Stream A (Doc 25 Foundation-Gaps)
- **`publish_status`-Gate** in `claimondo-mdx`: `draft`-Assets fliegen aus `getAllAssets` → kein Render/Sitemap/Listing. Default ohne Frontmatter = `live`. (Aktuell 0 Drafts → reine Capability.)
- **`/decoder`-Index-Hub** neu (`src/app/decoder/page.tsx`): listet alle 10 Decoder als Karten-Grid (Pattern wie `/sachverstaendige`-Hub). Allowlist (middleware `publicPaths` + proxy `MARKETING_PREFIXES`) war für `/decoder` schon da → **kein 307-Trap**. Sitemap-Eintrag ergänzt.
- **`/haftpflicht` → 301** auf `/kfz-haftpflicht-schaden` (next.config, **Exact-Match** ohne `:path*` → `/haftpflicht/[slug]` unberührt). Vermeidet Duplikat-Hub (der Cornerstone IST der Haftpflicht-Hub). **Aaron-Entscheid.**
- Bewusst NICHT: „+10 Spokes" (Content, kein Code) + „Build-Smoke als PR-Pflicht" (CI-Config).

## Verifikation
- `tsc` 0 · `token-audit` 0 · `vitest` 5/5 (merge) + 15/15 (mdx) · `next build` **exit 0, 304/304 static pages** (+1 = /decoder-Hub).
- Dev-Smoke: `/haftpflicht/sv-kosten` → **1 FAQPage** (war 2), Stems IN der FAQPage gemergt (`stemsIn=true`), FaqStems-Block weiter sichtbar. `/decoder` → HTTP 200, **10 Decoder-Karten** (Screenshot). `/haftpflicht` → **308 → /kfz-haftpflicht-schaden**; `/haftpflicht/4-wochen-frist` → 200 (unberührt).

## Damit sind die Sprint-1-Code-Reste zu
Offen bleibt aus Sprint 1 nur Nicht-Code: J-Baseline-AI-Test (Aaron), K/L Off-Site (GBP/Citations/Reddit), I LexDrive-Body-Review. Sprint 2-4 (Konversions-Pages, Coup, Twin-Brands, 25 Decoder, Press) = separater Scope.
