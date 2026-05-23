# Stream I — Pillar-C Publishing (Hebel 6)

**Sprint:** 1 · **Tag:** 5–6 · **Owner:** Aaron + LexDrive (Body-Review, 3 h) + Claude Code (4 h) · **Aufwand:** 7 h
**Quell-Spec:** Doc 26 Stream C + Doc 30 §8 · **G0-Gate:** A3 (Option A/B/C)
**Quell-Files:** `marketing-strategy/research/Pillar-C-Technik/C-GE.1..8` (8 Files + 2 Uebersichten)
**Code-Files:** `src/content/claimondo/sachverstaendige/*.md`, `src/app/sachverstaendige/[slug]/page.tsx`, `src/app/sachverstaendige/page.tsx`, `src/lib/content/claimondo-mdx.ts`

## Auftrag

1. 10 SV-Verbaende-Files portieren (bvsk, dekra, gtue-kues-tuev-ifl, zkf, ifs-leitsaetze, zak, ihk-bestellung-oebv, pruefdienstleister + 2)
2. Frontmatter migrieren (`type: sachverstaendige-glossar`, `cluster: SV`, `publish_status: live|draft`)
3. `claimondo-mdx.ts`: `folder`-Type um `'sachverstaendige'` erweitern (3 Stellen: Type, `readOneFolder`-Pfadkaskade, `getAllAssets`) + `getSachverstaendige()`
4. Render-Route `/sachverstaendige/[slug]` (Pattern wie `haftpflicht/[slug]`) + Hub `/sachverstaendige`

## DoD

- 10 SV-Pages live (oder draft bei Option C); Hub-Page live; in sitemap + llms.txt

## Validation

- `curl /sachverstaendige/bvsk` zeigt Page
- `curl /sachverstaendige` zeigt Hub (ClusterHubGrid)

## Gotchas (Pflicht!)

- **Neue `/sachverstaendige`-Route MUSS in `middleware.ts` publicPaths + `proxy.ts` MARKETING_PREFIXES** —
  sonst 307→/login fuer anon + Crawler, Build bleibt gruen (stiller Trap, Doc-16-Erfahrung)
- `last_legal_review: pending` bis LexDrive-Review (Sprint 1 Tag 5)
- Build `NODE_OPTIONS=8192`, Smoke `next dev`
