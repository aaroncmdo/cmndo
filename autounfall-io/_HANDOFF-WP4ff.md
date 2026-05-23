# Session-Handoff · autounfall.io · WP-4ff · 2026-05-23 (abends)

> **Für die nächste Claude-Code-Session.** WP-0 bis WP-3 sind gebaut + als PR gegen `staging` raus (WP-0/1/2 gemergt, WP-3 im Review). Diese Datei = Einstieg für **WP-4 und folgende**. Basis-Pfad aller `Seiten nicolas/`-Verweise: `…/claimondo-v2/marketing-strategy/Seiten nicolas/` (gitignored → per absolutem Pfad lesen, nur im Main-Checkout).

---

## 0 · Nächster Schritt (in einem Satz)
Baue **WP-4 (Tools)** — 6 Rechner + Wizard + Kürzungs-Checker + Unfallbericht-Tool (+ den aus WP-3 zurückgestellten SF-Rechner) — als interaktive `"use client"`-Components nach Next.js, eigener Worktree von `staging`, PR gegen `staging`. Bau-Brief = `FINAL/HANDOVER-DOCS-1/04_PROMPTS/WP-4-tools-port.md`.

---

## 1 · Was schon steht (WP-0…WP-3)

| WP | Inhalt | Branch | PR | Status |
|---|---|---|---|---|
| WP-0 | Foundation: Next-16-Standalone-App `autounfall-io/`, au-Tokens (@theme), lokale Fonts, `<Logo/>`, Header/Footer, Plausible, `<JsonLd/>`+`siteGraph`, error/loading/not-found, `scripts/contrast-check.mjs` | `kitta/aar-au-00-autounfall-foundation` | #1595 | **gemergt** |
| WP-1 | Pflichtseiten: `/impressum` + `/datenschutz`, `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts`, `public/llms.txt`+`llms-full.txt`, `.legal-prose` | `kitta/aar-au-01-autounfall-pflichtseiten` | #1601 | **gemergt** |
| WP-2 | 71 Artikel: `app/[article]`, Content-Layer (`lib/article-types.ts`, `content/articles.generated.ts`, `lib/articles.ts`), `articleGraph()`, `components/article/parts.tsx` (Prose/QuickAnswer/AtAGlance/FAQ/CTA), 42 Hero-webp | `kitta/aar-au-02-autounfall-articles` | #1612 | **gemergt** |
| WP-3 | 20 Decoder + Hub: `app/versicherer-decoder/[slug]` + `/page.tsx`, `lib/decoder-types.ts`, `content/decoder-data.generated.ts`, `lib/decoders.ts`, `decoderGraph()`, `components/decoder/DecoderArticle.tsx` | `kitta/aar-au-03-autounfall-decoder` | #1617 | **im Review** |

**Live-Stand:** `autounfall-io/` ist auf `staging`. **Noch kein Live-Deploy** (autounfall.io zeigt den alten statischen Platzhalter → Go-Live = WP-8). Lokal smoken: `npm --prefix autounfall-io run build && npm --prefix autounfall-io start` (Branch-Worktree).

---

## 2 · Kanonische Quellen (Querverweise)
- **WP-Prompts (Quelle der Wahrheit):** `FINAL/HANDOVER-DOCS-1/04_PROMPTS/WP-4…WP-9.md`. Offen: WP-4 Tools, WP-5 PSEO, WP-6 Lead-Form, WP-7 Rest-Seiten, WP-8 Infra, WP-9 Regression.
- **Override (gilt über allem):** `FINAL/HANDOVER-DOCS-1/00_README.md` (Standalone) + `02_REGELN.md` (harte Regeln + Bestätigungs-Formular) + `ENTITY-MODELL-LOCK-2026-05-23.md`.
- **Routing-Bibel:** `FINAL/HANDOVER-DOCS-1/PORT-MAPPING-STATIK-ZU-NEXTJS.md` (Seite/Tool → Route). **§B = Tools** (für WP-4).
- **Memory (auto-geladen):** `project_autounfall_io` — der lebende Stand (WP-0…3 + alle Entscheidungen).
- **Vorgänger-Handoff:** `HANDOFF-SESSION-AUTOUNFALL-2026-05-23.md` (Einstieg WP-0).

## 3 · Quell-Assets (read-only)
- **HTML/Tools/Tokens:** `FINAL/autounfall-SOURCE-lean/` — 274 Prototyp-HTML + `assets-autounfall/` (au-rechner.js, *-widget.js, decoder_content.py, kuerzungs-checker-data.json, sf-versicherer.json, schmerzensgeld-daten.json, nutzungsausfall-tagessaetze.json, au-base.css, …). **WP-4-Tool-Logik liegt hier 1:1.**
- **Bild-Assets (entpackt):** **`C:\au-assets\assets-autounfall`** — 948 Files (410 jpg / 184 avif / 184 webp / 100 png + JS/JSON/Fonts/PDFs). Drive-ZIP `autounfall-ASSETS.zip` per `gdown --folder <drive-link>` geladen, per **bsdtar** (`tar -xf` aus PowerShell) entpackt — **Expand-Archive UND git-bash-GNU-tar scheitern** am macOS-ZIP. Drive-Link im `FINAL/UEBERGABE-FINAL-CLAUDE-CODE.md`.
- **Port-Skripte (temp, uncommitted, wiederverwendbar):** `C:\Users\Aaron Sprafke\AppData\Local\Temp\port-articles.py` (Artikel) + `port-decoders.py` (Decoder) — BeautifulSoup + markdownify + Pillow.

---

## 4 · Etablierte Patterns (für neue WPs WIEDERVERWENDEN)
- **1 WP = 1 Worktree von staging = 1 PR vs staging.** `node scripts/new-session-worktree.mjs aar-au-NN-autounfall-<slug> staging` (aus Main-Checkout). **NICHT mergen** (nicht die Merge-Session). Diff vor Commit zeigen; pro WP der Prompt-Checkpoint („zeig 1 Beispiel BEVOR du alle N machst").
- **STANDALONE (Override, da WP-Prompts Pre-Pivot-Reste haben):** root-level `app/…` (KEIN `(hub)`), **KEIN `#partner-service`/Claimondo**, publisher/author = nur **Kitta & Sprafke UG**, `#legal-reviewer = LexDrive UG` bleibt. Die Prompts nennen teils noch `(hub)` + `#partner-service` — **ignorieren**.
- **Brand-Tokens:** Accent = Orange `#C04920` (textsicher) / `#FF7849` (dekorativ) / `#92400E` (amber-dark, Prose-Links) — NICHT das alte Amber `#B45309`. Tokens in `app/globals.css` `@theme` (Namen `au-amber*`).
- **Content-Layer-Muster:** `lib/<x>-types.ts` (Typen, keine Imports) + `content/<x>.generated.ts` (Skript-generiert) + `lib/<x>.ts` (Loader) + Registry. Generierung per Python-Skript (deterministisch > Handarbeit bei N≥20).
- **JSON-LD:** `lib/jsonld.ts` — `siteGraph(extra)` + `articleGraph()` + `decoderGraph()`. Neue Typen: eigenen `xGraph()` **anhängen** (nicht bestehende Funktionen ändern → kein Merge-Konflikt mit Parallel-WPs). Author=`#publisher`-Org wenn kein Person nötig.
- **Components (reuse!):** `components/article/parts.tsx` (Prose=react-markdown, QuickAnswer, AtAGlance, FAQ, ArticleCta), `components/decoder/DecoderArticle.tsx`. Styles: `.article-prose`, `.quick-answer-prose`, `.legal-prose` (alle in globals).
- **Routen:** RSC + `generateStaticParams` + `generateMetadata` + `export const dynamicParams = false` (unbekannte Slugs → 404). CTA → `/gutachter-finden` (WP-6), Checker → `/kuerzungs-checker` (WP-4). Sitemap (`app/sitemap.ts`) bei neuen indexierbaren Routen ergänzen; noindex (PSEO/Leadmagnete/Selbstanzeige) NICHT aufnehmen.
- **Bilder:** Hero-PNG/JPG aus `C:\au-assets` → webp (Pillow, max-1536/q80) nach `public/heroes/` (o.ä.). 5-MB-PNGs sind zu schwer für git; Squash-Merge verwirft Zwischen-PNGs. Hero optional/graceful.
- **Verifikation pro WP:** `npm run build` (SSG-Routen!) + `npx tsc --noEmit` + `npm run check:contrast` (18/18) + Grep `claimondo|partner-service` über prerenderte HTML = **0** + Screenshot-Smoke (Playwright-CLI aus Main-Checkout: `npx playwright screenshot --full-page <url> <out>`). Server: `next start` warnt bei `output:standalone` (Deploy nutzt `node .next/standalone/server.js`, WP-8) — Routen liefern trotzdem 200.
- **Main-Repo bleibt grün:** `autounfall-io` ist aus claimondo-v2 `tsconfig`/`eslint` ausgeklammert; `check:token-audit` ist `src/`-scoped → au.io außerhalb. Gatender PR-Check = `build` (e2e läuft gegen Prod, nicht den PR).

## 5 · Gotchas / Lessons
- ZIP-Extraktion: **bsdtar aus PowerShell** (`tar -xf … -C …`), nicht Expand-Archive (rollt zurück) / nicht GNU-tar (liest kein ZIP) / `tar` braucht `/c/…`-Pfad statt `C:\…`.
- PowerShell 5.1 `Get-Content`/Console = ANSI → Umlaut-Mojibake nur in der **Anzeige**; geschriebene Files sind UTF-8 (Write-Tool). Im gerenderten HTML mit ripgrep (UTF-8) gegenprüfen.
- **Canonical-treu bleiben:** Artikel/Decoder mit **nested Canonical** (`/fahrerflucht/<x>`, `/nutzungsausfall/<x>`, `/schadenfreiheitsklasse/<x>`) NICHT in die flache `[article]`-Route — sie gehören in Hub-Sub-Routen (WP-7). `next start` + ripgrep-Timeout auf großem `.next/` → PowerShell `Select-String` scoped statt Grep-Tool.

---

## 6 · WP-4 (Tools) — konkret
- **Prompt:** `FINAL/HANDOVER-DOCS-1/04_PROMPTS/WP-4-tools-port.md`. **Routing:** PORT-MAPPING §B.
- **Quellen (in SOURCE-lean/assets-autounfall + C:\au-assets):** `au-rechner.js` (6 Rechner: nutzungsausfall|schmerzensgeld|sf|totalschaden|wertminderung|verzugszinsen — eine typ-parametrisierte `<Rechner>`-Component), `kuerzungs-checker-widget.js` + `kuerzungs-checker-data.json`, `unfallbericht-widget.js` (Druck/PDF via `window.print`, localStorage), `UNFALL-ASSISTANCE.html`-Wizard, `sf-rueckstufungs-rechner-widget.js` + `sf-versicherer.json`, `schmerzensgeld-daten.json`, `nutzungsausfall-tagessaetze.json`.
- **+ aus WP-3 zurückgestellt:** der SF-Rechner (`ARTICLE-sf-klasse-rechner.html` = `WebApplication`, canonical `/schadenfreiheitsklasse/rechner/`) gehört hierher.
- **Achtung:** `"use client"` nur für Interaktivität; localStorage-State; Logik **1:1 portieren** (Beträge/Tabellen exakt); JSON → TS-Konstante; Datenschutz-§3 (lokale Speicherung) ist schon erwähnt. Keine Supabase-Writes (das ist WP-6).

## 7 · Offene Aaron/Kevin-Punkte (blocken WP-4 nicht)
- **au.io-Kontakt:** eigene **E-Mail** (`NEXT_PUBLIC_SITE_EMAIL`) + **Telefon** (`NEXT_PUBLIC_SITE_PHONE`) — aktuell Platzhalter (`aaron.sprafke@claimondo.de` / `0221 25906530` sind Footprints). In `lib/site.ts`.
- **WP-6 §7:** Verarbeitet die **Claimondo GmbH** die Formular-Daten? → dann als Auftragsverarbeiter in `/datenschutz` §7 nennen (Code-TODO ist dort gesetzt). Kevin/Aaron.
- **Recht:** Handelsregister/USt-IdNr (Impressum „in Vorbereitung"), LexDrive-Freigabe der Rechtsseiten + Werkstattrisiko/Wertminderung-Decoder-Wording.
- **WP-8 Go-Live:** eigene GSC-Property, vhost `proxy_pass :3002`, PM2 `autounfall-io`, ENV `/etc/autounfall/.env.local`, `node .next/standalone/server.js`.
- **Nachzügler-Content (WP-7):** 10 nested-Canonical-Artikel, Pillars (`PILLAR-*`), Master-Hubs (`HUB-*`), Vergleiche (`VERGLEICH-*`), der 21. Decoder (`wir-pruefen-sachverhalt` — fehlt in `decoder_content.py`).

## 8 · Koordination
Parallele Sessions bauen claimondo.de-Content. au.io strikt **eigenständig** halten (kein Claimondo, keine Cross-Links). Eigener Worktree pro WP; lokal nie `main` pullen/pushen; PR `--base staging`.

*Stand 2026-05-23 abends. Erstellt nach WP-0…WP-3 (4 WPs + Asset-Pipeline + Smokes in einer Session).*
