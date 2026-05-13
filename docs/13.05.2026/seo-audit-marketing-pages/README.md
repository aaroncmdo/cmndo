# SEO-Audit Marketing-Pages — 13.05.2026

On-Page-SEO + CORE-EEAT-Audit (8 URLs) gegen Production. Quelle: `/seo:audit-page`-Skill, 3 parallele Agent-Batches.

**Domain-Routing:** `app.claimondo.de/<marketing-path>` → 301 → `claimondo.de/<marketing-path>` für alle Marketing-Routen. `app.claimondo.de/` selbst ist Login-Shell.

## Scope

| URL | Batch | Typ | Status |
|---|---|---|---|
| `/` (app-Root, Login) | A | App-Shell | publish-block (sollte `noindex`) |
| `/kfz-gutachter` | A | Pillar Informational | publish-ready, JSON-LD-Gap |
| `/gutachter-finden` | A | Geo-Tool | **Veto C01** (Thin) |
| `/gutachter-partner` | B | B2B-Akquise (Subdomain `gutachter.claimondo.de`) | **Veto C01** (Thin, Warteliste) |
| `/beratung-anfragen` | B | Conversion B2C | publish-ready, JSON-LD-Gap |
| `/ersteinschaetzung` | B | Conversion B2C | publish-ready, JSON-LD-Gap |
| `/faq` | C | Content Informational | **Veto T04** (Client-Render, SSR-Body leer) |
| `/schadensreport-2026` | C | Content Hub / Data-Report | publish-ready, Tabellen-Semantik-Gap |

## Top-Findings (über alle Pages)

### 1. **Meta-Description fehlt flächendeckend** (7/7 indexierbaren Pages)
Kein `generateMetadata()`-Default für Marketing-Routen. Google generiert SERP-Snippet aus Body → CTR-Verlust.
**Fix:** Zentrale `generateMetadata()`-Convention pro `src/app/(marketing)/*` mit `description` Pflicht.

### 2. **JSON-LD-Lücke projektweit**
Keine `Organization`/`WebSite` im Root-Layout. Page-spezifische Schemas (`FAQPage`/`Service`/`HowTo`/`LocalBusiness`/`Article`) fehlen außer auf `/schadensreport-2026` (das hat `Article`, aber kein `Person`-Author).
**Fix:** `Organization` + `WebSite` global in `src/app/layout.tsx` + Helper `src/lib/seo/jsonld.ts`.

### 3. **`/faq` ist Client-Render-Shell** → **GEO-Tod**
0 Headings, 0 FAQ-Items im SSR-HTML. AI-Crawler (Perplexity, ChatGPT, Brave) bekommen leere Page.
**Fix:** Q&A-Body als Server Component, Akkordeon-Interaktion in kleiner Client-Sub-Component. `FAQPage`-JSON-LD inline.

### 4. **Thin-Content auf 2 High-Intent-Pages** (C01-Veto)
- `/gutachter-finden`: ~200 Wörter Tool-Maske, keine Begleit-Inhalte → ranked nicht gegen Check24/KÜS/DEKRA.
- `/gutachter-partner`: ~200 Wörter Warteliste-Formular ohne Provisionsmodell/FAQ/Onboarding-Doku.

### 5. **Title-Template-Bug**: Doppel-`| Claimondo`-Suffix auf URL B1+B2
Vermutlich Layout-Default appendet Brand auf bereits gebrandete Titles.

### 6. **YMYL-Vertrauenslücke**
Inhalte zitieren §249 BGB, BGH-Urteile, BVSK, aber **keine sichtbare Author/Reviewer-Byline** + kein `Person`-Schema. Für KFZ-Schaden (juristisch/finanziell) Ranking-Cap.
**Fix:** Reviewer-Byline (Nicolas Kitta / LexDrive-Kanzlei) + `Person`-Schema mit Rolle.

### 7. **`app.claimondo.de/` (Login) nicht `noindex`**
Brand-Query-Kannibalisierung mit `claimondo.de/`.
**Fix:** Middleware-Header `X-Robots-Tag: noindex,nofollow` auf `app.claimondo.de/`.

### 8. **Tonalitäts-Drift `/gutachter-partner` (Du) vs. B2B-ToV (Sie)**
Memory `project_b2b_tov` definiert SV-intern=Du, Partner-Plattform=Sie. Klärung: gehört SV-Akquise zu „intern" oder „extern-Partner"?

### 9. **Hub-Spoke unvollständig**
Stadt-Pages (`/gutachter/koeln` etc.) sind auf `/gutachter-finden` orphan-nah. Subdomain `gutachter.claimondo.de` hat 0 Backlinks zur Hauptdomain → SEO-Isolation.

### 10. **`/schadensreport-2026` Tabellen nicht-semantisch**
BVSK-Honorartabelle als CSS-Grid statt `<table>` → AI-Engines extrahieren schlechter, Title 94 Zeichen (SERP-Truncation).

## Priorisierte Roadmap (1 Sprint)

| Prio | Aufgabe | Pages | Aufwand | Hebel |
|---|---|---|---|---|
| **P0** | `generateMetadata()`-Default + Meta-Description-Texte | 7 | S | CTR auf allen Marketing-SERPs |
| **P0** | `Organization` + `WebSite` JSON-LD global | alle | S | Entity-Reinforcement, GEO |
| **P0** | Title-Template-Bug Fix (Doppel-Brand) | 2 | S | sofort |
| **P0** | `/faq` SSR-Conversion + `FAQPage`-Schema | 1 | M | Veto-Lift T04, GEO-kritisch |
| **P1** | `/gutachter-finden` Content-Ausbau (≥800 W.) + Stadt-Links + `LocalBusiness`-Schema | 1 | M | Veto-Lift C01 |
| **P1** | `/gutachter-partner` Content + Tonalitäts-Klärung | 1 | M | Veto-Lift C01 |
| **P1** | `HowTo`-Schema `/ersteinschaetzung` | 1 | S | Rich-Result |
| **P1** | `LocalBusiness`-Schema mit `telephone`/`openingHours` `/beratung-anfragen` | 1 | S | Knowledge-Panel/Phone-Snippet |
| **P1** | Reviewer-Byline + `Person`-Schema (YMYL) | 4 | M | E-E-A-T-Cap-Lift |
| **P2** | `noindex` `app.claimondo.de/` | 1 | XS | Brand-SERP-Cleanup |
| **P2** | `/schadensreport-2026` semantische `<table>` + Title kürzen + `Dataset`-Schema | 1 | M | AI-Citation |
| **P2** | Trust-Block (Testimonials/Logos) als shared Component | 3 | M | R-Dimension |

## CORE-EEAT Scores

| Page | C | O | R | E | Avg |
|---|---|---|---|---|---|
| `/` (Login) | 10 | 15 | 25 | 30 | 20 (irrelevant) |
| `/kfz-gutachter` | 78 | 65 | 82 | 70 | 74 |
| `/gutachter-finden` | 45 | 50 | 55 | 50 | 50 |
| `/gutachter-partner` | 35 | 25 | 20 | 30 | 28 |
| `/beratung-anfragen` | 65 | 60 | 55 | 50 | 58 |
| `/ersteinschaetzung` | 70 | 65 | 65 | 60 | 65 |
| `/faq` | 25 | 60 | 75 | 55 | 54 (SSR-blocked) |
| `/schadensreport-2026` | 82 | 88 | 90 | 80 | **85** |

## Nächste Schritte

1. P0-Tickets in Linear schneiden (5 Stk., alles S/XS).
2. Phase 1B (String-Extraktion) kann parallel laufen — keine Konflikte mit den Marketing-SEO-Fixes.
3. `generateMetadata()`-Helper + JSON-LD-Helper als ersten Commit; danach Page-by-Page nachziehen.

## Roh-Outputs

- `batch-a-top-organic.md` — Home/kfz-gutachter/gutachter-finden
- `batch-b-conversion.md` — gutachter-partner/beratung-anfragen/ersteinschaetzung
- `batch-c-content-info.md` — faq/schadensreport-2026
