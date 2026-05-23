# Design-Spec — claimondo.de Content-Render-Routen (Doc 16 / Doc 24)

**Datum:** 2026-05-22
**Branch:** `kitta/doc16-claimondo-content-routes`
**Status:** Brainstorming abgeschlossen, Layout von Aaron freigegeben (Archetyp C). Bereit für writing-plans.
**Bezug:** Doc 16 (Content-Strategie), Doc 23 (Execution-Report), Doc 24 (Implementation-Plan Claude Code).

---

## 1 · Ziel & Kontext

Wir rendern 69 bereits generierte Markdown-Assets als öffentliche HTML-Seiten auf claimondo.de. Die Files liegen unter `src/content/claimondo/` (2 Cornerstones, 57 Haftpflicht-Spokes, 10 Decoder) und sind die **Single Source of Truth für Production** (`marketing-strategy/` ist gitignored, kein Build-Input).

**Primärziel (von Aaron geschärft):** Für eine konkrete Nutzerfrage („wie lange darf die Versicherung prüfen", „wir prüfen den Sachverhalt — was heißt das") soll genau **eine** Seite ranken (Google) bzw. von LLMs (ChatGPT/Perplexity/AI-Overview) zitiert werden. Das Layout ist dafür notwendig, aber nur ~20 %; die Hebel sind Content-Phrasierung + Metadata + strukturierte Daten + Crawlbarkeit. Der Content ist bereits dafür gebaut (`primary_keyword` = exakte Query, Antwort-Block zuerst, FAQPage/HowTo-Schema handgepflegt im MD).

**Zielgruppe:** Geschädigte mit aktivem/akutem Kfz-Haftpflicht-Schaden (High-Intent, Top-of-Funnel). Public, kein User-Context → **kein Whitelabel-Branding**, Claimondo-Default (analog Marketing-Pages, siehe AGENTS.md §branding).

---

## 2 · Layout — Archetyp C „Hybrid-Autorität"

Drei Archetypen im Visual-Brainstorm verglichen; Aaron wählte **C** (5× bestätigt). Begründung: liest sich wie ein Ratgeber (Verweildauer + AI-Citation), signalisiert über Trust-Chips Autorität, holt High-Intent-Leser über **dosierte** CTAs ab, ohne dass ein juristischer Erklärtext werblich kippt (B hätte SEO-Lese-Signal beschädigt, A Conversion liegen gelassen).

### 2.1 Spoke-Seite (Grundtemplate, 57×)

Struktur top→bottom:

1. **`LandingTopbar`** (bestehend, `authenticatedUser={null}`)
2. **Heller Marken-Header** (kein Navy-Hero):
   - Eyebrow = Cluster-Badge, z. B. „H4 · Fristen" (`text-claimondo-ondo`, uppercase, `tracking-[0.18em]`)
   - `<h1>` (Montserrat, `text-claimondo-navy`, ~42px, `font-extrabold`)
   - **„Kurz erklärt"-Snippet-Box** (light-blue Tint, `border-l-4 border-claimondo-ondo`) — extrahierbare Antwort, **nur hier** (im Body entfernt, siehe §4.3)
   - **Trust-Chips** automatisch je Artikel: §§/BGH-Az aus dem Content + festes Brand-Signal „Bundesweites SV-Netzwerk · Sitz Köln"
   - Meta-Zeile: „Aktualisiert {last_modified}" + Lesezeit + Redaktion
3. **2-Spalten-Body:** links **sticky TOC** (nur H2, `position:sticky top-[84px]`), rechts Lese-Spalte (`max-w-[740px]`, Noto Sans, `prose`-artig)
4. **Mid-CTA** (soft, ondo-getönt) nach der ersten inhaltlichen Sektion
5. **Related-Block** = Cluster-Geschwister-Grid (siehe §5.3)
6. **End-CTA-Band** (Navy, radiale Glows wie /vorteile) mit „Schaden melden" + WhatsApp
7. **`LandingFooter`** (bestehend) — Cornerstones dort verlinken (Footer-Edit)
8. **Content-Sticky-Call-Bar** (Navy „Anrufen" · grün „WhatsApp" · „Rückruf") — fixed, immer präsent

Mobile: TOC kollabiert zu einklappbarer „Auf dieser Seite"-Karte oben; 1-spaltig.

### 2.2 Variante Decoder (`/decoder/[slug]`, 10×)

Kurze, hoch-konversionsstarke Seite (jemand hält *diesen* Brief in der Hand):
- **Kein TOC** (Seite kurz).
- Header wie Spoke, Eyebrow „Versicherer-Brief-Decoder", H1 = Brief-Satz.
- Originalbrief-Zitat-Box → knappe Entschlüsselung.
- **`DecoderCtaBlock`** (kräftiger als Spoke-CTA, Navy) **nach** dem Inhalt: „Genau diesen Brief bekommen? Wir antworten kostenlos für Sie." mit **Anrufen + WhatsApp primär**, „Online melden" sekundär.
- Wichtig SEO: CTA sitzt **nach** der extrahierbaren Antwort (Antwort-zuerst-Regel bleibt).

### 2.3 Variante Cornerstone-Hub (`/kfz-haftpflicht-schaden`, `/ratgeber`, 2×)

Pillar-Seite, Einstieg in die 57 Spokes:
- Header (größer), kein eigenes TOC.
- **`ClusterHubGrid`**: Karten je Cluster (H1, H2, H3, H4, H6, H7) mit Label + 2–3 Beispiel-Spoke-Links → SEO-Silostruktur + Orientierung.
- Danach Cornerstone-Fließtext (MarkdownRenderer).
- `/ratgeber` analog, aber Persona-basiert (5 Dialoge statt Cluster-Grid) — Cluster-Grid nur wenn `folder===cornerstones && slug==='kfz-haftpflicht-schaden'`; `/ratgeber` rendert nur Header + Body + Related.

---

## 3 · SEO/GEO — harte Akzeptanzkriterien

Diese fünf Hebel sind **Pflicht** (das ist der eigentliche Projektzweck, nicht die Optik):

| # | Hebel | Umsetzung | Wirkung |
|---|---|---|---|
| 1 | Eigene URL je Frage | 4 Routen, SSG, je MD = 1 Seite | „ein Post pro Frage", kein Kannibalisieren |
| 2 | `<title>` + Description je Seite | `generateMetadata`: title aus Query/`primary_keyword`, description = „Kurz erklärt"-Snippet | SERP-Treffer + LLM-Quelle |
| 3 | **Pro-Artikel JSON-LD aus dem MD** | `## Schema (JSON-LD)`-Codeblock parsen + als `<script type="application/ld+json">` injizieren; Fallback generischer `articleSchema` bei Parse-Fehler | FAQ-Rich-Result + „People also ask" |
| 4 | Saubere Semantik | `MarkdownRenderer` → echtes `<h1/h2/h3>`, `<table>`, `<article>`, Slug-Anker (rehype-slug) | Crawler/LLM-Extraktion |
| 5 | Crawl-/Fetch-Fläche | SSG (kein JS-Gate) + sitemap.xml + llms.txt + llms-full.txt (Schritt 0) | direkte Einlieferung |

**Ehrliche Grenze (dokumentiert):** LLM-Zitierbarkeit ist damit sofort stark. Google-Platz-1 hängt zusätzlich an Domain-Autorität/Backlinks/Zeit — nicht vom Layout entscheidbar. Cluster-Hub + Related-Links liefern interne Themen-Autorität als Beitrag dazu.

---

## 4 · Render-Pipeline (MarkdownRenderer)

Stack: `react-markdown` + `remark-gfm` (Tabellen) + `rehype-slug` + `rehype-autolink-headings` (H2/H3-Anker). **Server-Component** (RSC, kein Client-Bundle). `@tailwindcss/typography` für `prose` (prüfen/installieren; Tailwind 4 → `@plugin` in globals.css). React-19-Peer-Check (ggf. react-markdown v10).

**Body-Transformationen vor dem Rendern (im Helper `claimondo-mdx.ts` oder MarkdownRenderer):**

### 4.1 `## Schema (JSON-LD)`-Sektion strippen
Jede MD endet mit einer `## Schema (JSON-LD)`-Sektion + ```json-Block. Diese aus dem **sichtbaren** Body entfernen (sonst hässlicher Code-Block) — aber das JSON **extrahieren** und als echtes Schema injizieren (Hebel 3).

### 4.2 `## Quellen` + rechtlicher Hinweis bleiben sichtbar
Quellen = E-E-A-T-Signal → sichtbar lassen. Nur die Schema-Sektion strippen.

### 4.3 Leading „Kurz erklärt"-Blockquote deduplizieren
`extractSnippet()` zieht das erste Blockquote. Dasselbe Blockquote im Body entfernen, damit es nicht doppelt unter H1 erscheint (Header-Box zeigt es).

### 4.4 Interne Links
`href` startsWith `/` **oder** `https://claimondo.de` → `<Link>` (Client-Nav, kein neuer Tab). Externe → `target="_blank" rel="noopener noreferrer"`.

### 4.5 `---`-Trenner
Als ruhiger Abstand rendern (kein dicker `<hr>`); dezente Hairline max.

### 4.6 Tokens statt Plan-Defaults
Plan-Code nutzte `blue-700`/`gray-50` → **ersetzen** durch Claimondo-Tokens (`text-claimondo-navy/ondo/shield`, `bg-claimondo-bg`, `border-claimondo-border`, emerald nur semantisch). Kein Inline-Hex (token-audit CI). WhatsApp-Grün `#25D366` ist in `external-brand-colors.ts` whitelisted → als Voll-Ton erlaubt.

---

## 5 · Komponenten (`src/components/content/`)

Marketing-Page-Idiom: tokenisiertes Tailwind analog `/vorteile` (Sibling-Konsistenz), bestehende `LandingTopbar`/`LandingFooter`/`StickyCallBar` wiederverwenden. Wo ein Primitive sauber passt (Button), bevorzugen; bespoke Artikel-Layout nicht künstlich in den Atom-Layer zwingen. Kein Inline-Hex.

| Komponente | Zweck |
|---|---|
| `MarkdownRenderer` | Server-Component, MD→HTML mit Tokens, §4-Transformationen |
| `AssetHero` | Header: Eyebrow/Cluster-Badge, H1, Snippet-Box, Trust-Chips, Meta |
| `TrustChips` | Chip 1 = Cluster-Label (`clusterLabel`-Kurzform); Chip 2 = festes Brand-Signal „Bundesweites SV-Netzwerk · Sitz Köln"; Chips 3–4 = best-effort §/BGH-Treffer via Regex (`§\s?\d+\w*`, `BGH\s+[IVX]+\s?ZR\s?\d+/\d+`) auf dem Body, dedupe, max 2 — bei 0 Treffern weglassen (kein Platzhalter) |
| `TableOfContents` | Sticky H2-Liste (Desktop), einklappbar (Mobile). MVP ohne Scroll-Spy-JS (optional später) |
| `RelatedAssets` | Cluster-Geschwister-Grid (Frontmatter `related` optional, sonst Cluster) |
| `DecoderCtaBlock` | Decoder-spezifischer starker CTA (Anruf+WhatsApp) |
| `ClusterHubGrid` | Cornerstone-Hub: Cluster→Spoke-Navigation |
| `ContentJsonLd` | injiziert pro-Artikel-Schema (Hebel 3) mit Fallback |

**StickyCallBar-Erweiterung:** optionaler `whatsappHref`-Prop (default off) → WhatsApp-Button (grün, persistent). Non-breaking für /vorteile etc. Auf Content-Pages aktiv. WhatsApp ist damit „immer präsent" (Aaron-Anforderung).

**`claimondo-mdx.ts`-Erweiterung:** `ClaimondoAsset` um `related?: string[]` ergänzen (Parser kann Arrays bereits). Helper für Schema-Block-Extraktion + Body-Cleanup (Snippet/Schema strippen).

---

## 6 · Routen-Specs (`src/app/`)

Alle: `generateStaticParams` (SSG), `generateMetadata`, `notFound()` bei unbekanntem Slug. JSON-LD-Signaturen in `src/lib/seo/jsonld.ts` **verifizieren** vor Nutzung (`SITE_URL`, `breadcrumbsSchema`, `jsonLdScript`).

| Route | Quelle | Besonderheit |
|---|---|---|
| `/kfz-haftpflicht-schaden` | `getCornerstones()` slug-match | Cluster-Hub-Grid |
| `/ratgeber` | dito | Persona-Layout, kein Hub-Grid |
| `/haftpflicht/[slug]` | `getHaftpflichtSpokes()` | Spoke-Grundtemplate + Cluster-Breadcrumb |
| `/decoder/[slug]` | `getDecoder()` | DecoderCtaBlock, kein TOC. **Echte deutsche Slugs** (z. B. `wir-pruefen-sachverhalt`); Plan-Beispiel `we-have-prepared-an-offer` ist stale |

Breadcrumb-JSON-LD: Spoke = Start → Haftpflicht-Wissen (`/kfz-haftpflicht-schaden`) → Titel. Decoder = Start → Decoder → Titel.

---

## 7 · CTA-Strategie (locked)

| Punkt | Entscheidung |
|---|---|
| WhatsApp | persistent in Sticky-Bar (grün) + in jedem CTA-Block |
| Spoke Mid-CTA | „Anspruch prüfen" → `/check` |
| Spoke End-Band | „Schaden melden" → `/schaden-melden` + WhatsApp |
| Decoder-CTA | Anruf + WhatsApp primär, „Online melden" sekundär |
| Tonalität | „du" (wie Content; Geschädigte). Sie nur B2B |
| Telefon | `0221 25906530` / E.164 + `wa.me/4922125906530` (aus bestehenden Konstanten/jsonld) |

---

## 8 · Edge Cases

- **Ungültiges `last_modified`** → `new Date('')`/Invalid Date würde `.toISOString()` werfen. Guard: bei Invalid Date auf `new Date()` (heute) fallen, im Build beobachten.
- **Malformed Schema-JSON** im MD → try/parse, bei Fehler generischer `articleSchema`-Fallback (kein Build-Bruch).
- **Cornerstone/Decoder ohne Cluster-Geschwister** → RelatedAssets rendert `null` (kein Crash). Akzeptabel.
- **404** → `notFound()` + Default `not-found.tsx`.
- **`folder`-Filter in RelatedAssets** verhindert Cluster-Kollision H4(Haftpflicht) vs H8(Decoder).

---

## 9 · Bewusst NICHT in Scope (MVP)

- Scroll-Spy-Aktiv-State im TOC (statische Anker reichen; optional später)
- Dynamische OG-Images je Seite (globales OG bleibt; eigenes Ticket Doc 25)
- Decoder-Hub `/decoder` + Cluster-Filter-Hubs (Doc 25 Backlog)
- FAQ-Extraktion aus `**bold**`-Fragen (das pro-Artikel-FAQPage-Schema deckt es bereits ab)
- Whitelabel-Branding (public Marketing-Pages → Claimondo-Default)

---

## 10 · Reihenfolge der Umsetzung (nach writing-plans)

1. **Schritt 0** — 69 MD-Files + `claimondo-mdx.ts` (+ Erweiterungen) + robots/sitemap/llms committen. **Nur** Content-Routes-Pfade adden (NICHT die fremde DSGVO-docx). Build-Smoke. (2 logische Commits: content seed; seo wiring.)
2. Deps installieren (react-markdown-Stack, @tailwindcss/typography prüfen), React-19-Peer-Check.
3. Komponenten (impeccable) im Claimondo-Design.
4. Routen (4×) + JSON-LD-Injektion + Metadata.
5. StickyCallBar-WhatsApp-Prop + Footer-Links.
6. Verifikation (Build, curl-Smokes, JSON-LD-Validierung) + PR `--base staging` + finishing-branch.

PR-Base: **staging** (nie main). Branch: `kitta/doc16-claimondo-content-routes`.
