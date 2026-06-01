# Audit · Marketing-Split claimondo.de — Vollständigkeit & Sauberkeit

**Datum:** 31.05.2026 · **Auslöser:** weißer Bildschirm beim Klick auf interne Links auf claimondo.de (Aaron-Report). · **Scope:** der gesamte Marketing-Umzug (Monolith :3000 → Standalone-Marketing-Build :3006), nicht nur die heutigen makler./kfzgutachter.-Subdomains.

---

## 0 · TL;DR

Die Vorgänger-Session hat `claimondo.de` auf den Standalone-Marketing-Build (PM2 `claimondo-marketing`, :3006) geschaltet (Stream 7), **bevor** der Build inhaltlich vollständig war. Migriert wurde die „Schale" (Landing + ~33 Seiten). **Nicht** migriert wurde:

1. **19 Marketing-Routen** (ratgeber, decoder/*, haftpflicht/*, sachverstaendige/*, versicherer/*, + 11 Einzel-Content-Seiten).
2. **105 Markdown-Content-Dateien** (`src/content/claimondo/**`) — die eigentliche SEO-Substanz. Zusätzlich: `claimondo-mdx` liest über `process.cwd()/src/content/claimondo`, was im Marketing-Build (kein `src/`) nicht existiert.
3. **Die komplette SEO/Metadata-Schicht**: `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`, `favicon.ico`, `llms.txt`, `llms-full.txt`, `manifest`.

**Folge:** Klick auf einen nicht-migrierten Link → 404 (für Aaron „weißer Bildschirm"). Und: `claimondo.de/sitemap.xml`, `/robots.txt`, `/llms.txt` lieferten auf dem reinen :3006-Build **404** — ein echtes SEO-Risiko.

**Sofort-Mitigation (heute gesetzt):** nginx **Strangler-Fallback** im `claimondo`-Vhost — jede Route, die :3006 mit 404 beantwortet, fällt transparent auf den vollständigen Monolith (:3000) zurück. **Dadurch ist die Live-Site jetzt voll funktionsfähig und SEO-intakt** (sitemap 200/199 URLs, robots 200, llms.txt 200, alle Content-Routen 200). Der Fallback maskiert die gesamte obige Lücke.

**Status:** Kein akuter Brand mehr. Die Marketing-Split ist aber **inhaltlich erst ~Hälfte fertig**; „sauber + voll separiert von der App" erfordert die unten gelistete Restmigration.

---

## 1 · Methodik

- Reproduktion: Playwright-Klick-Durchlauf auf `claimondo.de` → 404 auf `/ratgeber` u.a. (vorher), 200 + Content (nach Fallback).
- Routen-Matrix: HTTP-Status jeder verlinkten Route auf :3006 vs :3000 (Host-Header `claimondo.de`).
- Nav-Quelle: `LandingTopbar.tsx` (i18n-Dropdowns `ratgeber_menu`/`gutachter_menu`) + `LandingFooter.tsx`.
- Datei-Inventar: `src/app` vs `claimondo-marketing/app`; `src/content/claimondo`; SEO/Metadata-Konventionsdateien.
- Live-Checks: sitemap/robots/llms/opengraph/favicon auf claimondo.de.

---

## 2 · Befund-Inventar (nach Dimension & Severity)

### D1 — Routen (SEV: hoch) · 19 fehlend
Alle **public Marketing-Content-Seiten**, kein App/Auth, **0 Heavy-Deps** (kein AI/OCR/Wizard/Dispatch/3D):

| Gruppe | Routen | Risiko |
|---|---|---|
| ratgeber | `/ratgeber` | Content-Stack |
| decoder | `/decoder`, `/decoder/[slug]` (11 Briefe) | Content-Stack |
| haftpflicht | `/haftpflicht`, `/haftpflicht/[slug]` (57 Spokes) | Content-Stack |
| sachverstaendige | `/sachverstaendige`, `/sachverstaendige/[slug]` (8) | Content-Stack |
| versicherer | `/versicherer`, `/versicherer/[slug]` (12) | Content + Daten (versicherer-mapping, BAFIN) |
| Einzelseiten (11) | `/e-auto-gutachter`, `/gegnerische-versicherung-zahlt-nicht`, `/kosten-kfz-gutachten`, `/lkw-gutachter`, `/motorrad-gutachter`, `/unfall-was-tun-als-geschaedigter`, `/unfallskizze`, `/unverschuldeter-unfall-rechte`, `/versicherung-schickt-gutachter`, `/kfz-haftpflicht-schaden`, `/decoder/werkstatt-netz` etc. | LIGHT |

**Status heute:** Routen-Dateien (page.tsx) von mir in `claimondo-marketing/app` kopiert. Build kompiliert. ABER Content leer (siehe D2).

### D2 — Content-Engine (SEV: hoch) · 105 .md + Pfad-Bug + Standalone-fs
- **105 Markdown-Dateien** in `src/content/claimondo/`: cornerstones 2, decoder 11, haftpflicht 57, sachverstaendige 8, versicherer 12, `_translations` 15. **Nicht migriert.**
- **Pfad-Bug:** `lib/content/claimondo-mdx.ts` → `CONTENT_ROOT = path.join(process.cwd(), 'src', 'content', 'claimondo')`. Im Marketing-Build gibt es kein `src/` → `readdirSync` findet nichts → `generateStaticParams` der `[slug]`-Routen liefert **[]** → diese Seiten werden **gar nicht generiert** (leer trotz grünem Build).
- **Standalone-Runtime-Risiko:** Next-Standalone (`.next/standalone`) bündelt per `outputFileTracing` nur statisch erkannte Datei-Reads. `fs.readFileSync(path.join(process.cwd(), ...))` mit dynamischem Pfad wird i.d.R. **nicht** getraced → die .md fehlen zur Laufzeit, falls die Seiten dynamisch (`ƒ`) statt statisch gebaut werden. Muss explizit über `outputFileTracingIncludes` (next.config) eingebunden **oder** die Seiten echt statisch (SSG) gerendert werden.
- **Fix nötig:** (a) `src/content/claimondo/**` in den Build kopieren, (b) `CONTENT_ROOT` an die Marketing-Build-Struktur anpassen, (c) Standalone-Tracing/SSG sicherstellen.

### D3 — SEO/Metadata-Schicht (SEV: kritisch für SEO) · komplett fehlend im :3006-Build
Im Monolith vorhanden, im Marketing-Build **0**:

| Datei | Monolith | Marketing-Build | Live claimondo.de (heute) |
|---|---|---|---|
| `sitemap.ts` → /sitemap.xml | ✓ (199 URLs) | ✗ | 200 — **nur via Fallback** |
| `robots.ts` → /robots.txt | ✓ (alle Bot-Regeln) | ✗ | 200 — **nur via Fallback** |
| `app/llms.txt` → /llms.txt | ✓ (85 Wissens-Assets) | ✗ | 200 — **nur via Fallback** |
| `app/llms-full.txt` → /llms-full.txt | ✓ | ✗ | (Fallback) |
| `opengraph-image.tsx` | ✓ | ✗ | 200 — **nur via Fallback** |
| `favicon.ico` | ✓ | ✗ | 200 — **nur via Fallback** |
| `public/manifest.json` + favicon.svg | ✓ | ✗ | (Fallback) |

**Kernrisiko:** Würde der Fallback **vor** Migration dieser Dateien entfernt, lieferte claimondo.de sitemap/robots/llms.txt/og/favicon = **404** → unmittelbarer SEO-Schaden (Google/Bing verlieren Sitemap + Crawl-Steuerung). Der Fallback ist aktuell die einzige Brücke.

### D4 — Shared Components / Libs / Deps (SEV: mittel) · weitgehend geschlossen
- **21 Content-Komponenten** (`components/content/*`: MarkdownRenderer, AssetHero, CitationBox, TableOfContents, VersichererHero, KuerzungsHeatmap, BafinFaktencheck, …) + `components/seo/AuthorBox` → **kopiert**.
- **libs** `lib/content/claimondo-mdx`, `validate-frontmatter`, `lib/seo/*`, `lib/initials` → kopiert (teils schon vorhanden).
- **6 data-Files** (citation-box-mapping, faq-stems-mapping, vr-bait-mapping, versicherer-mapping, decoder-versicherer-cross, versicherer-detail) → kopiert.
- **npm-Deps** `rehype-slug@^6`, `rehype-autolink-headings@^7` → installiert. Build **grün** (✓ Compiled, 134 statische Seiten).

### D5 — Nav/Link-Integrität (SEV: mittel)
- Nav-Dropdowns + Footer + BGH-Karten verlinken auf D1-Routen. Vor Fallback: tote Links. Nach Fallback: alle 200.
- `/versicherer` fehlt **schon in der Monolith-Sitemap** (vorbestehend, vermutlich WIP `sprint-1-versicherer-hubs`) — separat zu klären.

---

## 3 · Was der nginx-Fallback aktuell maskiert

```
location / {
    proxy_pass http://127.0.0.1:3006;   # Marketing-Build (migrierte Seiten)
    proxy_intercept_errors on;
    error_page 404 = @monolith;          # alles andere -> Monolith
}
location @monolith { proxy_pass http://127.0.0.1:3000; }   # vollständiger Monolith
```
Maskiert: **alle 19 Routen + 105 Content-Files + die komplette SEO/Metadata-Schicht.** D.h. ~die halbe Marketing-Site läuft real noch aus dem Monolith. Das ist als **Übergangszustand sauber** (Strangler-Pattern), aber **nicht** der Endzustand „Marketing komplett separiert".

---

## 4 · Plan zur sauberen Fertigstellung (SEO-sicher, sequenziert)

> Leitprinzip: **URLs, Content, Canonicals, sitemap/robots/llms bleiben byte-identisch.** Fallback bleibt als Netz, bis :3006 alles selbst liefert. Erst dann Monolith-Abbau.

**P1 — Content-Engine vollständig (D1+D2)**
1. `src/content/claimondo/**` (105 .md) in den Build kopieren.
2. `CONTENT_ROOT` marketing-tauglich machen (kein `src/`-Hardcode) — z.B. `path.join(process.cwd(), 'content', 'claimondo')` + Files dorthin.
3. `outputFileTracingIncludes` für die Content-Routen in `next.config.ts` ODER SSG erzwingen → .md liegen im Standalone.
4. Build grün + **lokaler Render-Smoke**: je eine `[slug]`-Seite pro Cluster rendert echten Content (nicht leer).

**P2 — SEO/Metadata-Schicht (D3)**
5. `sitemap.ts`, `robots.ts`, `app/llms.txt`, `app/llms-full.txt`, `opengraph-image.tsx`, `favicon.ico`, `manifest` in den Marketing-Build portieren — **identische Ausgabe** (sitemap muss dieselben URLs listen; diff gegen Monolith-Output).
6. Verify: `:3006` liefert /sitemap.xml, /robots.txt, /llms.txt host-geroutet identisch.

**P3 — Deploy + Verify (noch mit Fallback als Netz)**
7. Deploy :3006 (npm install + build, .env-Symlink, pm2 reload).
8. **Klick-Durchlauf-Smoke** über alle Nav/Footer-Links + sitemap-URLs: jede Route 200 **aus :3006** (nicht Fallback) + Content sichtbar + Screenshots.

**P4 — Fallback entfernen**
9. Erst wenn :3006 nachweislich ALLE Marketing-URLs + SEO-Files liefert: `proxy_intercept_errors`/`error_page` aus dem Vhost nehmen. Re-Verify.

**P5 — Marketing aus dem Monolith (destruktiv, separat, abgestimmt)**
10. Marketing-Routen + Content aus `src/app` / `src/content` entfernen, `app.claimondo.de/<marketing>` → `claimondo.de` Redirects (proxy.ts/next.config). **Eigener PR gegen staging**, koordiniert mit den parallelen Sessions (mehrere arbeiten in `src/`).

---

## 5 · Alternative (falls Vollmigration vertagt werden soll)

**Rollback claimondo.de → :3000** (Monolith). Ein `sed` im Vhost, sofort 100 % funktional + SEO-komplett, da der Monolith vollständig ist. Marketing-Split wird dann als Projekt sauber zu Ende gebaut und neu geschaltet. Nachteil: „Marketing-Build live" entfällt vorübergehend. (Die makler./kfzgutachter./gutachter.-Subdomains können auf :3006 bleiben — ihre Nav redirectet auf claimondo.de.)

---

## 6 · Empfehlung

- **Kurzfristig:** Fallback **belassen** — die Live-Site ist damit voll funktionsfähig + SEO-intakt. Kein Druck.
- **Sauberer Endzustand:** P1–P5 abarbeiten. P1+P2 sind die Substanz (Content-Engine + SEO-Files); P5 (Monolith-Abbau) zuletzt + abgestimmt.
- **Entscheidung Aaron nötig:** (a) Vollmigration jetzt durchziehen (P1–P5), oder (b) Fallback als dauerhaften Übergang lassen und P1–P5 als eigenes Ticket terminieren, oder (c) Rollback auf :3000 bis komplett.

---

## 7 · Heute bereits erledigt (diese Session)

- makler.claimondo.de + kfzgutachter.claimondo.de: Content in :3006 migriert, deployed, Vhost auf :3006 geswitcht, extern verifiziert (PR #2093 gegen staging, code-only).
- nginx Strangler-Fallback gesetzt → weiße Bildschirme + SEO-Files-404 behoben.
- Content-Komponenten/libs/data + rehype-Deps in den Build gezogen (Build grün) — Content-Files (D2) + SEO-Files (D3) stehen noch aus.
