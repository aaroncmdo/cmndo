# SEO Keyword-Content A+B+C — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes. Each Phase (A/B/C) is an INDEPENDENT PR — ship separately.

**Goal:** Aus der SEO-Master-Synthese (2026-05-28) die nicht-kannibalisierenden, unowned Keyword-Items bauen: (A) sichtbare BVSK-Kosten-Tabelle auf der bestehenden `/kfz-gutachter/kosten`-Page, (B) B2B-Ratgeber-Cluster, (C) UWG-saubere Konkurrenten-Diversion-Pages.

**Architecture:** Reine Marketing-Frontend-Pages (Next 16, App Router, `next-intl`). Topic-Pages = TSX-Route mit `LandingTopbar`/`AnswerCapsule`/`ReviewerByline`/`LandingFooter`/`StickyCallBar` + JSON-LD via `@/lib/seo/jsonld`. **Aller sichtbarer Text liegt in `src/i18n/messages/de.json`** (kein hardcoded Deutsch — i18n-Konvention). Tabellen via `@/components/shared/DataTable`. Discoverability: Route in `src/app/sitemap.ts` eintragen + intern verlinken (`LandingFooter` / Quell-Page).

**Tech Stack:** Next.js 16 (App Router, RSC), next-intl, Tailwind v4 (claimondo-Tokens), `@/components/shared/DataTable`, `@/lib/seo/jsonld`.

---

## ⚠️ Kritische geteilte Dateien (Kollisionsgefahr) + Discoverability

Diese Dateien sind **heiß** (mehrere aktive Sessions: i18n-phase2, entgendern, Hub-Rollout). Jede Phase fasst sie an → **Merge-Konflikte wahrscheinlich**. Mitigation: pro Phase eigener PR, **additive neue Namespaces** in `de.json` (nicht bestehende Keys umbauen), Edits spät + minimal, ggf. rebasen.

- `src/i18n/messages/de.json` — neue Texte. Additiv unter neuen Namespaces.
- `src/app/sitemap.ts` — manuelles Array, neue Routen anhängen (AGENTS.md: Erreichbarkeit-Pflicht).
- `src/components/landing/LandingFooter.tsx` — interne Verlinkung neuer Pages.

**AGENTS.md-Pflichten je Page:** Build grün (voller `npm run build`, Heap-Bump `--max-old-space-size=8192`); Umlaute korrekt (echte ä/ö/ü/ß in de.json); JSON-LD + canonical + `buildLanguageAlternates`; ReviewerByline-Datum; in sitemap.ts + intern verlinkt.

---

## Offene Entscheidungen (vor Build von Aaron bestätigen)

1. **i18n:** Neue Texte in `de.json` (empfohlen, konsistent mit laufender i18n-Migration) — akzeptiert die `de.json`-Kollisionsgefahr. ODER neue Pages hardcoden Deutsch (schneller, kein `de.json`-Konflikt, ABER Regression für die i18n-Sessions). → **Empfehlung: de.json.**
2. **B-Location:** B2B-Ratgeber als `/gutachter-partner/<topic>` Sub-Pages (clustert unter B2B-Pillar) — ODER `/ratgeber/<topic>`. → **Empfehlung: `/gutachter-partner/<topic>`.**
3. **C (UWG):** Konkurrenten-Liste bestätigen + Tonfall freigeben. C startet als `noindex`/Draft bis **juristische Freigabe** (Partnerkanzlei / dsgvo-Skill). Naming echter Wettbewerber ist UWG-sensibel.
4. **Sequenz:** A → B → C (A am kleinsten/sichersten, C am heikelsten).

---

## PHASE A — Sichtbare BVSK-Kosten-Tabelle auf `/kfz-gutachter/kosten`  (eigener PR)

**Warum:** Goldkeyword „kfz gutachter kosten tabelle" (1000–10k Vol, 7% Conv). Page existiert + rankt, hat aber **keine sichtbare Tabelle** (nur Card-Grid + FAQ-Text). Tabelle ergänzen = Suchintent „tabelle" bedienen **ohne neue, kannibalisierende Seite.**

**Files:**
- Modify: `src/app/kfz-gutachter/kosten/page.tsx` (neue `<section>` mit DataTable nach dem bestehenden `bvskBeispiele`-Card-Grid)
- Modify: `src/i18n/messages/de.json` (Namespace `kfz_gutachter_kosten`: `tabelle_caption`, `tabelle_cols` [array], `tabelle_rows` [array], `tabelle_footnote`)
- Reuse: `@/components/shared/DataTable` (`DataTableContainer, Table, Thead, Tbody, Tr, Th, Td`)

**Tabellen-Inhalt (BVSK-HB-V 2025, nach Schadenhöhe/WBW — Quelle: bestehende FAQ der Page):**

| Schadenhöhe (brutto) | Gutachter-Honorar (Spanne) |
|---|---|
| bis 1.000 € | Bagatell — i.d.R. kein SV, Kostenvoranschlag |
| 1.000–3.000 € | ca. 380–650 € |
| 3.000–5.000 € | ca. 550–800 € |
| 5.000–10.000 € | ca. 700–1.100 € |
| 10.000–15.000 € | ca. 1.100–1.500 € |
| 15.000–25.000 € | ca. 1.500–2.000 € |
| 25.000–50.000 € | ca. 2.000–2.600 € |

(Werte konsistent mit den FAQ-Beispielen: 5.000 €→~700 €, 15.000 €→~1.400 €, 30.000 €→~2.200 €. Footnote: Spannen nach BVSK-HB-V-Befragung 2025; Honorar trägt bei unverschuldetem Unfall die gegnerische Haftpflicht §249 BGB.)

**Tasks:**

- [ ] **A1: de.json-Keys ergänzen** — unter `kfz_gutachter_kosten` die Keys `tabelle_caption`, `tabelle_cols` (Array: ["Schadenhöhe (brutto)", "Gutachter-Honorar (Spanne)"]), `tabelle_rows` (Array von [höhe, honorar]-Paaren, Werte oben), `tabelle_footnote`. Echte Umlaute.
- [ ] **A2: DataTable-Section bauen** — in `kosten/page.tsx` `DataTableContainer`-Import + neue `<section>` (Heading aus `tabelle_caption`, `Table`/`Thead`/`Tbody` aus `tabelle_cols`/`tabelle_rows` gemappt, Footnote). Platzierung: direkt nach dem bestehenden `bvskBeispiele`-Card-Grid. Tokens (`claimondo-*`), keine Hex.
- [ ] **A3: Build** — `rm -rf .next; NODE_OPTIONS=--max-old-space-size=8192 npm run build` → grün (Compiled + TypeScript + static pages). Output-File lesen (nicht `| tail`).
- [ ] **A4: Visual-Smoke** — `next start` + Playwright auf `/kfz-gutachter/kosten` (Page rendert host-unabhängig; nur gtag ist host-gated). Screenshot → Tabelle sichtbar + responsiv (`DataTableContainer` scrollt mobil). Im selben Turn auswerten.
- [ ] **A5: Commit + PR** gegen staging (7-Punkt-Audit im Body).

---

## PHASE B — B2B-Ratgeber-Cluster  (eigener PR)

**Warum:** GSC zeigt B2B-Akquise-Keywords auf Pos 60–85 mit Impressionen (neukundengewinnung/leads/marketing für Kfz-Gutachter). `/gutachter-partner` (Pillar) existiert; Spokes fehlen → Topical-Cluster aktivieren.

**Ton:** B2B-Partner = **Sie/formell** (ToV-Memory `project_b2b_tov`). Fakten/Zahlen, keine Floskeln. Jede Page verlinkt zur Pillar `/gutachter-partner` (Conversion-Ziel: Partner-Anmeldung).

**Pages (je TSX-Topic-Page nach `/kfz-gutachter/<topic>`-Muster, neuer de.json-Namespace, sitemap + Link von `/gutachter-partner`):**

1. **`/gutachter-partner/neukundengewinnung`** — H1 „Neukundengewinnung für Kfz-Sachverständige" — Keywords: neukundengewinnung/kundengewinnung kfz sachverständiger+gutachter. Sektionen: Problem (Auslastung schwankt) → Kanäle (organisch/Ads/Plattform) → Claimondo-Modell (qualifizierte Geschädigten-Leads, kein CPL-Risiko) → FAQ → CTA Pillar.
2. **`/gutachter-partner/leads-generieren`** — H1 „Leads für Kfz-Gutachter generieren" — Keyword: leads für kfz-gutachter generieren. Sektionen: Was ist ein qualifizierter SV-Lead → Lead-Quellen vs. Claimondo-Zuteilung → Qualität/Exklusivität → FAQ → CTA.
3. **`/gutachter-partner/marketing`** — H1 „Marketing für Kfz-Gutachter" — Keywords: marketing/kundenakquise für kfz-gutachter. Sektionen: Offline vs. Online → lokale SEO/Bewertungen → Plattform-Distribution → FAQ → CTA.

**Files je Page:**
- Create: `src/app/gutachter-partner/<topic>/page.tsx` (Pattern aus `kfz-gutachter/ablauf/page.tsx`: `generateMetadata` via `getTranslations('page_meta')`, Hero + `AnswerCapsule` + Content + FAQ + CTA + `ReviewerByline` + `LandingFooter`/`PartnerFooter`, JSON-LD `serviceSchema`+`breadcrumbsSchema`+`faqPageSchema`)
- Modify: `src/i18n/messages/de.json` (`page_meta.gutachter_partner_<topic>` + Content-Namespace `gutachter_partner_<topic>`)
- Modify: `src/app/sitemap.ts` (3 Routen, priority ~0.7)
- Modify: `src/components/gutachter-partner/PartnerContent.tsx` ODER `PartnerFooter.tsx` (interne Links Pillar→Spokes)

**Tasks (pro Page wiederholen):**
- [ ] **B<n>.1:** de.json `page_meta.<key>` (title/description/og_*) + Content-Namespace (hero, capsule, sektionen[], faqs[]). Echte Umlaute, Sie-Form.
- [ ] **B<n>.2:** `page.tsx` nach ablauf-Muster; JSON-LD; canonical + `buildLanguageAlternates`; CTA-Link `/gutachter-partner`.
- [ ] **B<n>.3:** sitemap.ts-Eintrag + Link von `/gutachter-partner` (PartnerContent/-Footer).
- [ ] **B-Build:** voller Build grün (Heap-Bump). + Visual-Smoke je Page (Screenshot, rendert + verlinkt).
- [ ] **B-PR:** ein PR für alle 3 Spokes gegen staging (7-Punkt-Audit).

---

## PHASE C — Konkurrenten-Diversion-Pages  (eigener PR, GATE: juristische Freigabe)

**Warum:** GSC/Ads zeigen Brand-Suchen nach Wettbewerbern (100% CTR teils). Neutral-journalistische Vergleichsseiten fangen diese ab.

**⚠️ UWG-GATE:** Vergleichende Werbung + Naming echter Wettbewerber ist rechtlich heikel. **Diese Phase startet `publish_status`/robots = `noindex` Draft, bis Aaron + Partnerkanzlei (oder dsgvo-/legal-Skill) den Tonfall freigeben.** Vorbild: `src/app/kfz-gutachter/vermittlungsportale-vergleich/page.tsx` — objektiv, zitiert Gesetze/Urteile, `rel="nofollow noopener"` auf Wettbewerber-Domains, nur belegbare Aussagen, keine Herabsetzung.

**Route:** `src/app/alternative/[konkurrent]/page.tsx` (statische `generateStaticParams` aus einer `konkurrenten.ts`-Datenliste) ODER je eine statische Route. **Empfehlung:** Daten-getriebene `[konkurrent]`-Route + `src/app/alternative/konkurrenten.ts` (Name, Slug, belegbare Fakten, Quelle, Domain).

**Konkurrenten (aus Synthese — vor Build bestätigen):** unfallpaten, mb-gutachter(-walsum), dreckmann-thom, kfz-gutachtenzentrale-deutschland, station-janssen.

**Seiten-Struktur (UWG-safe, je Konkurrent):** H1 „Alternative zu [X]: Claimondo im Vergleich" → neutrale Was-macht-[X]-Erklärung → **Vergleichstabelle** (`DataTable`, nur belegbare/neutrale Kriterien: Geschäftsmodell, Kostenträger §249, Unabhängigkeit, Abdeckung) → „Wann welche Option passt" → §249-BGB-Kontext → FAQ → CTA. Wettbewerber-Domain nur mit `rel="nofollow noopener"`, Quellen-Footnote mit Abrufdatum.

**Files:**
- Create: `src/app/alternative/[konkurrent]/page.tsx`, `src/app/alternative/konkurrenten.ts`, `src/app/alternative/[konkurrent]/opengraph-image.tsx` (optional)
- Modify: `src/i18n/messages/de.json` (`page_meta.alternative` + `alternative` Content-Namespace, pro Konkurrent Daten in `konkurrenten.ts`)
- Modify: `src/app/sitemap.ts` (Routen NUR wenn indexierbar — bis Freigabe weglassen/noindex)

**Tasks:**
- [ ] **C0: GATE** — Aaron + juristische Freigabe einholen. Ohne Freigabe: `noindex`, nicht in sitemap, nicht verlinkt.
- [ ] **C1:** `konkurrenten.ts` Datenliste (belegbare Fakten + Quelle je Konkurrent).
- [ ] **C2:** `[konkurrent]/page.tsx` nach vermittlungsportale-vergleich-Muster + `DataTable`; `rel="nofollow noopener"`; Quellen-Footnoten; robots `noindex` bis Freigabe.
- [ ] **C3:** de.json-Keys (neutral, belegbar, keine Herabsetzung).
- [ ] **C4: Build** grün + Visual-Smoke (Screenshot, neutraler Ton, Tabelle, nofollow-Links).
- [ ] **C5:** Nach Freigabe: `noindex` raus, sitemap-Einträge, intern verlinken. **PR.**

---

## Self-Review

- **Spec-Abdeckung:** A = Goldkeyword-Tabelle (#2 der Synthese); B = B2B-Cluster (Synthese Teil A B2B + Welle-3 #9); C = Konkurrenten-Diversion (Synthese B3 + Welle-3 #7). Hyperlocal-Städte (#6) + Decoder-Set BEWUSST ausgelassen → gehören aktiven Sessions (Hub-Rollout / sprint-1-versicherer-hubs), sonst Doppelarbeit/Kannibalisierung. Title-Tag-Fixes (Welle-1 #1) + Ads-Copy = Aarons UI-Tasks bzw. eigener Mini-PR (separat, da sie bestehende Pages anderer Sessions berühren).
- **Kollision:** de.json/sitemap.ts/LandingFooter.tsx als heiß markiert + Mitigation (additiv, eigene PRs, rebase).
- **Erreichbarkeit:** jede neue Route → sitemap + interner Link (AGENTS.md).
- **UWG:** Phase C hart gegatet (noindex bis Freigabe).
- **Konsistenz:** Tokens statt Hex; Umlaute in de.json; B2B = Sie-Form; DataTable wiederverwendet.
