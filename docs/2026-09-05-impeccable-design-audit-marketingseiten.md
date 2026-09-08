# impeccable-Design-Audit aller Marketingseiten – 05.09.2026

**Auftrag (Aaron, 04.09. 23:00):** „wirklich alle Marketingseiten auch mit impeccable durchsehen, komplette Aufnahme und Updates … das muss per Playwright passieren."

**Register:** brand (PRODUCT.md, Wurzel des Repos). Maßstab sind die dort festgelegten Prinzipien („Erst ordnen, dann fordern", „Eine Entscheidung pro Bildschirm", „Belegen statt behaupten", „Ruhe ist eine Layout-Entscheidung"), die vier Anti-Referenzen (Versicherungs-Konzern, Vergleichsportal, generisches SaaS, Anwalts-Website alter Schule) und die Zugänglichkeitsziele (WCAG 2.2 AA, Fließtext ≥ 16 px, Touch-Ziele ≥ 44 px, RTL für ar). `DESIGN.md` fehlt – Folge-Deliverable `/impeccable document`.

Ergänzt den Copy-Audit vom 04.09. (`docs/2026-09-04-copy-audit-marketingseiten.md`); Umsetzungsplan mit Design-Tasks: `docs/superpowers/plans/2026-09-04-copy-audit-umsetzungsplan.md` (Tasks D1–D7).

---

## 0 · Umfang und Methode

| | |
|---|---|
| Seiten | **1.155** (claimondo.de 830 inkl. 6 Sprachen, 4 Subdomains, autounfall.io 260, 5 Cluster-LPs 61) |
| Viewports | 390×844 (mobil, Touch) und 1440×900; Overlay-Nachmessung zusätzlich 1280×720 |
| Datensätze | **2.310** (je Seite × Viewport), 16 Timeouts (s. §0.2) |
| Werkzeug | Playwright 1.60 + axe-core (`C:/pwtool/design-crawl.mjs`), Overlay-Nachmessung `C:/pwtool/overlay-precise.mjs`, Feld-/Heading-Probe `probe-fields.mjs` |
| Rohdaten | Session-Scratchpad `design/full/results.jsonl` (2.310 Zeilen), `design/aggregate.md`, Screenshots `design/full/shots/{mobile,desktop}/<slug>.jpg` (alle) und `.full.png` (44 Repräsentanten), Segmente `design/crops/` |

Je Seite gemessen: axe (wcag2a/aa, 2.1, 2.2), Tap-Ziele < 24 / < 44 px, Fließtext unter 16 px, Zeilenlänge, horizontaler Overflow, H1-Anzahl, Heading-Sprünge, CTA im Fold, fixe/sticky Elemente und ihre Abdeckung, Consent-Banner, CLS/LCP/TTFB, Bilder (alt, Maße, lazy, überdimensioniert), Fokus-Sichtbarkeit (6× Tab), Anti-Pattern-Signale (Glass, Gradient-Text, Seitenstreifen, Uppercase-Labels, identische Kartengitter, Hero-Kennzahlen, Geviertstriche, Animationen), Formularfelder ohne Label, Console-Fehler, HTTP ≥ 400. Dazu die visuelle Durchsicht von 44 Repräsentanten (Full-Page-Screenshots beider Viewports, in Segmente geschnitten).

### 0.1 Vier eigene Messfallen, korrigiert

1. **„Verdeckt" ist erst ein Befund, wenn der Blocker fixed/sticky ist.** Die erste Overlay-Messung meldete auch Elemente, die beim Scrollen unter dem sticky Header oder hinter der Leiste selbst lagen, und die Leiste, während sie gerade wegfuhr. Die Nachmessung zählt nur Blocker mit `position: fixed|sticky` außer dem Header, und nur Ziele, die frei im Viewport stehen (`overlay-precise.mjs`). Alle P0-Blockaden unten stammen aus dieser Messung.
2. **Fünf Repräsentanten-URLs waren erfunden** (`/flotte`, `/nutzungsausfall-rechner`, `autounfall.io/haftpflicht`, `autounfall.io/decoder/werkstatt-netz`, `kfz-unfallgutachter-koeln.de/kosten`) und liefern 404. Sie stehen im Inventar, sind aber kein Befund (Messfalle 3 aus Regel 4: erfundene Testdaten).
3. **TTFB unter eigener Last.** Während des Crawls (6 parallele Seitenaufrufe) lagen TTFB-p90 bei 1,0–1,2 s, Ausreißer 4–5 s (Stadtseiten Rheine, Viersen, Gladbeck, Dorsten, ar/Solingen) und es gab 502-Antworten auf RSC-Prefetches. Einzelmessungen nach dem Crawl: 0,23–0,27 s für dieselben Stadtseiten, Startseite 0,5–0,8 s. **Die Lastzahlen sind kein Performance-Befund der Seiten, sondern eine Kapazitätsbeobachtung** (Diagnosewerkzeug verändert den Gegenstand).
4. **Tab-Fokus verändert die Seite.** Die sechs Tab-Schritte für die Fokus-Messung öffneten auf Desktop das „Gutachter"-Dropdown – auf jedem Desktop-Screenshot ist es deshalb offen. Kein Befund, aber beim Lesen der Screenshots zu wissen.

### 0.2 Nicht gemessen

16 Datensätze liefen in den 120-s-Timeout: `/gutachter-partner` (6 Sprachen), `gutachter.claimondo.de`, `autounfall.io/gutachter-finden` – je beide Viewports, reproduzierbar auch mit Parallelität 2. Die Ursache ist die Seite, nicht der Messlauf: **die Netzwerk-Karte rendert 10.026 Mapbox-Marker als DOM-Elemente** (30.490 Knoten, Sprung von 436 auf 30.490 Knoten bei Sekunde 15, Hauptthread 1,7 s blockiert; danach brauchen sechs Tab-Schritte 35 s, axe und Screenshots laufen in den Timeout). Befund P1.9. Ebenfalls nicht bewertet: `/gutachter-finden` und `/werkstatt-finden` (Finder im `iframe`, eigene Scroll-Fläche – dort greift der Full-Page-Screenshot nicht, die Tap-/Schrift-Messung nur auf das äußere Dokument).

---

## 1 · Audit Health Score

| # | Dimension | Score | Kernbefund |
|---|---|---|---|
| 1 | Accessibility | **2** | Kontrast auf 1.278 von 2.310 Messungen (10.009 Knoten), Ursache ein Token (`shield/60`); Heading-Sprung auf 749/830 claimondo-Seiten (Footer `h4`); Tap-Ziele < 24 px auf 822/830 Seiten |
| 2 | Performance | **2** | LCP-p90 2,1 s (claimondo), 3,7–3,9 s Cluster, Ausreißer 5,5–7 s durch Hero-Fotos; CLS 0,389 auf dem `kfz-gutachter`-Hub (en/ar/tr, mobil), 0,331 auf 20 autounfall-Desktop-Seiten (Footer springt beim Streaming) |
| 3 | Responsive Design | **2** | Fixe Overlays decken CTAs, Felder und Wizard-Antworten (P0, s. §3); 77 % der Fließtext-Knoten unter 16 px; Overflow-X auf 97 claimondo- und 30 autounfall-Seiten (Tabellen, `code`, RTL) |
| 4 | Theming | **3** | Token-System steht (`claimondo-*`, `--brand-*`), Montserrat durchgängig; 11 Bracket-Hex, Opazitäts-Töne (`shield/50–70`, 113 Stellen) produzieren die Kontrastfehler |
| 5 | Anti-Patterns | **1** | Hero-Kennzahlen-Streifen (Startseite, Stadtseiten, Vorteile, LP, Partner), identische Kartengitter (78 Seiten), Uppercase-Tracked-Kicker (Ø 14/Seite, Cluster 37), Glass (Ø 7–8/Seite), Stockfoto-Hero, Cluster in Navy+Gold |
| | **Gesamt** | **10/20** | **Acceptable – significant work needed** |

---

## 2 · Anti-Pattern-Urteil

**Sieht das nach KI-Baukasten aus? Auf der Startseite und den Stadtseiten: ja, in vier von sechs Tells.**

1. **Hero-Metric-Template.** „2.000+ · 8 Mio. €+ · 32 Tage · < 15 Min" als Vier-Zahlen-Streifen mit kleinen Uppercase-Labels direkt unter dem Hero – auf Startseite, Stadtseiten, `/vorteile`, LP, allen Partnerseiten (BVSK / 0 € / §249 / < 48 h). Zwei der vier Zahlen sind laut Copy-Audit unbelegt. Das ist gleichzeitig der Verstoß gegen PRODUCT.md-Prinzip 3 („Belegen statt behaupten").
2. **Identische Kartengitter.** Startseite: 4 nummerierte Karten, 3 Karten, 6 Icon-Karten, 8 BGH-Karten, 2 Link-Karten – fünf Gitter hintereinander, alle gleich groß, Icon + Titel + Text. 78 claimondo-Seiten und alle Cluster-Startseiten tragen dieses Muster. PRODUCT.md nennt genau das als Anti-Referenz „generisches SaaS: drei gleiche Feature-Karten mit Icons".
3. **Uppercase-Tracked-Kicker über jeder Sektion** („§249 BGB – IHR GESETZLICHER ANSPRUCH", „WENN ES SCHWIERIG WIRD", „WIE ES FUNKTIONIERT", „SERVICE-REALITÄT", „WARUM WIR SCHNELLER SIND"): Ø 14 je Seite, im Cluster 37. impeccable: „repeating it as section grammar is AI scaffolding unless it's a deliberate, named brand system". Ein System ist es hier, benannt ist es nicht (kein DESIGN.md).
4. **Glass als Default.** `backdrop-blur` auf 131 Stellen im Marketing-Code, Ø 7–8 sichtbare Glasflächen je Seite (Subdomains 19–20): Kontaktleiste, Hero-Formular, Chips, Karten.
5. **Stockfoto-Hero.** Lächelndes Paar mit Smartphone vor unscharfem Auto (Startseite), Frau am Telefon vor Unfallwagen (Stadtseiten). PRODUCT.md-Anti-Referenz Nr. 1: „Navy plus Stockfotos lächelnder Berater".
6. **Kategorie-Reflex im Cluster:** Navy + Gold, „0 €" in Gold, 24/7-Sofortbadge – exakt das Beispiel „finance → navy + gold" aus dem impeccable-Reflex-Test. autounfall.io sitzt in der editorial-typografischen Spur (Fraunces kursiv + Inter + Uppercase-Mono-Labels + Kartenraster); als bestehende Identität geschützt, aber die gesättigte Spur.

Was **nicht** zutrifft: kein Gradient-Text (0), keine Seitenstreifen-Borders (0 auf claimondo, 3 auf autounfall, 2 im Cluster), keine Bounce-Animationen, keine Regenbogen-Verläufe. Geviertstriche: Ø 6,7/Seite claimondo (davon viele in Zitaten/BGH-Notationen), 14 autounfall, **57 im Cluster** (Copy-Task 8).

---

## 3 · Befunde nach Schwere

### P0 – Blocking: der Klick trifft das Overlay

Gemessen mit `document.elementFromPoint()` auf Mitte, links + 10 px und rechts – 10 px jedes Ziels, nur Blocker mit `position: fixed|sticky` außer dem Header, prod, 04./05.09.

| Seite | Viewport | Verdeckt | Blocker |
|---|---|---|---|
| `/` | 390×844 (ohne Scrollen) | Hero-CTA „Lassen Sie uns mit der Versicherung reden →" | Kontaktleiste (`StickyCallBar`, 110 px, 12 % des Viewports) |
| `/` | 1280×720 | Feld Name · Feld PLZ · „Jetzt kostenlosen Rückruf erhalten" | Kontaktleiste · ProvenExpert-Siegel (`.pe-pro-seal`, 150 px breit, rechts oben) |
| `/kfz-gutachter/koeln` | 390 / 1280 / 1440 | „Jetzt anrufen – oder Rückruf", Felder Name/Telefon/PLZ, Absenden | Kontaktleiste + Siegel |
| `/check` | 390×844 · 1280×720 | Antwort „Noch unklar ›" · „Teils ich, teils der Gegner ›", „Schaden online melden" | Kontaktleiste |
| `/versicherung-schickt-gutachter` (und die vier weiteren Spokes mit `hero_cta_primary`) | 390×844 | Hero-CTA „Eigenen Sachverständigen finden", Direktlinks am Seitenende | Kontaktleiste |
| autounfall.io Start | 390×844 · 1440×900 | Sektionsüberschrift · Werkzeugkarten „Unfall-Assistance", „Kürzungs-Checker" | Clarity-Hinweis (221 px hoch, 25 % des mobilen Viewports) |
| 5 Cluster-LPs | 390×844 | „Jetzt anrufen" (Hero) | Cookie-Karte (263 px) |

**Impact:** Der erste Knopf, den ein Geschädigter sieht, geht nicht – oder öffnet stattdessen das Leisten-Formular, das leer startet (Name, Telefon, Ort weg). Auf 1280–1366 px, der häufigsten Laptop-Klasse, liegt das Siegel exakt über dem Lead-Formular.

**Ursache:** `StickyCallBar` prüfte nur den Submit-Button auf Kollision (29.08.); das Siegel wurde am 13.08./23.08. gegen andere Overlays justiert, nie gegen das Hero-Formular auf Laptop-Breite. Dieselbe Klasse wie der `GlobalPosteingangFab`-Vorfall (16.07./11.08., Fixed-Overlay-Safe-Area-Gate).

**Behoben in PR #5868** (`kitta/copy-audit-design-d1`): Kollisionsprüfung gegen alle Felder/Knöpfe des Lead-Formulars, alle Hero-CTAs (`data-tracking` `*-hero`/`hero-*`) und `data-sticky-bar-avoid`-Container; Siegel unter 1400 px ausgeblendet (Entscheidung Aaron, reversibel); Clarity-Hinweis als schmale Leiste; Cluster-Cookie-Karte mobil als untere Leiste. Lokal nachgemessen: 0 verdeckte Ziele auf Startseite, Köln, Check in drei Viewports. Regel-4-Spec `tests/e2e/service-pitch-overlays-klickbar.spec.ts` (prod vorher 4 failed, lokal 6 passed).

### P1 – Major

**P1.1 Kontrast (WCAG 1.4.3).** axe `color-contrast` auf 1.278 Messungen. Die häufigsten Ziele, alle mit derselben Ursache – Sekundärtext als `text-claimondo-shield/60` (#75869d auf #f8f9fb = 3,52:1) bzw. `/50` (2,72:1): `time` (259 Messungen), Meta-Spans (257), `.text-body-xs.text-claimondo-shield/60` (116). Dazu Schritt-Ziffern `text-claimondo-border` (#e4e7ef, 1,17:1, 82+41+33+21), 11-px-Kicker `ondo` auf #f1f2f4 (4,43:1), Cluster-Kicker `#7ba3cc` auf hell (2,5:1, 11 Seiten), Consent-Hinweis im Glas-Formular (4,01:1). *Fix in #5868:* `shield/50|60 → /75` (5,26:1; 4,53:1 auf Glas), Ziffern `shield/55` (3,1:1, große Schrift), Kicker → `shield`, Hinweis `/85`. Bleibt: Cluster-Kicker (D6), `text-claimondo-light-blue` auf Weiß in Einzelfällen (124 Verwendungen, meist auf Navy = ok).

**P1.2 Fließtext unter 16 px – 77 % aller Fließtext-Knoten auf claimondo.de** (Cluster mobil 88 %, Subdomains 95 %, autounfall 32 %). Ursache ist das Token `--text-body: 14px` (`globals.css:174`) plus `text-body-sm` 13 px und `text-caption` 10 px; auf der Startseite: 127 Knoten 14 px, 65 × 12 px, 12 × 11 px, 10 × 10 px, nur 31 × 16 px. PRODUCT.md: „Fließtext nicht unter 16px" (Lesebrille und kleines Display sind Normalfall). Der Finder (`/gutachter-finden`) liegt zu 100 % unter 16 px (11–13 px). **Entscheidung Aaron (D2):** Token auf 16 px heben verändert 830 Seiten – oder gezielt Artikel-/Ratgeber-Fließtext (`prose`) und Formularhinweise auf 16 px, Rest bleibt.

**P1.3 Zeilenlänge auf Desktop:** 770 von 830 claimondo-Seiten und 257/260 autounfall-Seiten haben Absätze über 80 Zeichen je Zeile (Startseite bis 185 ch, autounfall 144 ch). impeccable: 65–75 ch. Betrifft Intro-Absätze unter Sektionsüberschriften (`max-w` fehlt) und Kartentexte in 3er-Gittern. (D2)

**P1.4 Heading-Reihenfolge:** 749/830 claimondo-Seiten springen von `h2` auf `h4` – die vier Footer-Spalten (`LandingFooter.tsx:71/163/203/244`). *Fix in #5868:* `h2` mit unveränderter Optik. Bleibt: `/kfz-gutachter/nutzungsausfall` (2 Sprünge im Inhalt, 6 Sprachen) und `/community` ohne `h1` (6 Sprachen).

**P1.5 Tap-Ziele:** axe `target-size` auf 1.120 Messungen (2.829 Knoten); größter Einzelposten das ProvenExpert-Widget (`.pe-link-…`, 150×20 px, 562 Messungen), dann Termin-Links im Verfügbarkeitsstreifen (20 px hoch), Footer-Städte-Links (20 px), FAQ-Ankerlinks 22×22 px, FAQ-Suchfeld 292×20 px, `/community` mit 175–258 Zielen unter 24 px (Listen-Links). *Fix in #5868:* FAQ-Anker 28 px + `focus-visible`, Termin-Links 28 px. Bleibt: Footer-Links, Community-Listen, Finder-Chips (D2).

**P1.6 Performance – Hero-Bilder und Streaming-CLS.** LCP-Ausreißer 5,5–7 s: `IMG.object-cover` der Stadtseiten (Solingen ar, München, Viersen), `div.hero-photo-bg` der Cluster-LPs (Solingen, Neuss, Hilden), `/en/gewinnspiel` 7 s. Cluster: 17 Bilder ohne `width/height`, 6 überdimensionierte (> 2,2× der Darstellung) je Startseite. CLS 0,389 auf `/en|ar|tr/kfz-gutachter` (mobil, `SECTION.relative.isolate` – Hero ohne reservierte Höhe), 0,331 auf 20 autounfall-Desktop-Seiten (`FOOTER.mt-auto` springt, wenn der gestreamte `<main>`-Inhalt ankommt). (D4)

**P1.7 „Eine Entscheidung pro Bildschirm" – verletzt auf der Startseite.** In den ersten zwei mobilen Bildschirmen: 4 Hero-CTAs (Versicherung reden, Online melden, Anrufen/Rückruf, WhatsApp) + Kontaktleiste (Anrufen, Gutachter finden, Rückruf) + WhatsApp-Bubble = **8 konkurrierende Aktionen**, darunter dreimal Telefon und zweimal WhatsApp. Auf 698 von 824 mobilen claimondo-Messungen decken fixe Elemente ≥ 12 % des Viewports dauerhaft ab. (D3)

**P1.8 Seitenlänge.** Startseite 29.818 px mobil (≈ 35 Bildschirme), `/ratgeber` 36.651 px, Cluster-Startseiten 23.000 px, Stadtseite Köln 21.746 px; 43 claimondo-Seiten mit über 20.000 Textzeichen. PRODUCT.md: „Ruhe ist eine Layout-Entscheidung … wenige gleichzeitige Reize". (D3, `/impeccable distill`)

**P1.9 `/gutachter-partner` zeichnet 10.026 Marker als DOM-Elemente.** Die Sachverständigen-Karte der Partner-Akquiseseite (6 Sprachen + `gutachter.claimondo.de`) lädt nach ~12 s alle `sv_leads` als einzelne Mapbox-HTML-Marker: 436 → 30.490 DOM-Knoten, Hauptthread 1,7 s am Stück blockiert, danach bleibt die Seite träge (sechs Tab-Schritte: 35 s; axe und Screenshots laufen in den 120-s-Timeout). Auf einem Telefon ist das die Seite, die „hängt". Es ist dieselbe Datenquelle wie die unbelegte „10036"-Zahl aus dem Copy-Audit (`getNetzwerkGroesse` zählt gescrapte Leads, aktiv verifiziert sind 10) und der ~562 fachfremden Einträge aus der SV-Leads-Lane. **Fix (D4):** Marker als GeoJSON-Source mit `cluster: true` (Mapbox rendert Cluster auf dem Canvas, keine DOM-Knoten) oder nur verifizierte Sachverständige als Marker; die Zahl aus der Karte nehmen. Messung: `C:/pwtool/probe-freeze.mjs https://claimondo.de/gutachter-partner`.

**P1.10 Finder-iframe (nachgemessen 05.09., innerer Frame `app.claimondo.de/embed/gutachter-finder`, 390×844).** 52 von 53 Textknoten unter 16 px (10–15 px), 9 von 24 Bedienelementen unter 44 px, axe `color-contrast` 15 Knoten im Frame, Mapbox-Link 88×23 px. Der Finder ist die Seite, auf die der Primär-CTA der Startseite führt – und sie liegt im App-Code (`src/`), nicht in `claimondo-marketing`. → D2 gilt auch dort; Messung `C:/pwtool/probe-finder-frame.mjs` (Messfalle 1: nur der innere Frame zählt).

### P2 – Minor

- **Overflow-X mobil:** 97 claimondo-Seiten (davon `/haftpflicht/nutzungsausfall` in 6 Sprachen: `code` 495 px + Tabelle 412 px; `ar/…` zusätzlich `div.min-h-screen` 600 px = RTL-Layoutbruch), 30 autounfall-Seiten (Tabellen/`code`), `llms*.txt` (`pre`). (D5)
- **`nested-interactive`** auf 479 Messungen: `div[data-monika-widget] .mk-teaser` (429) und `#netzwerkTeamCard` (50) – klickbarer Container mit Knopf darin. (D5)
- **`definition-list`/`dlitem`** auf 44 Messungen (`.space-y-3`-Wrapper zwischen `dl` und `dt/dd`). (D5)
- **`link-name`** auf 28 Messungen: Icon-Links ohne Namen (`a[rel="nofollow noopener noreferrer"]` auf Stadtseiten, `a[rel="noopener"]`). (D5)
- **i18n-Blöcke bleiben deutsch** in en/tr/ar/ru/pl: Verfügbarkeitsstreifen („NÄCHSTE FREIE VOR-ORT-TERMINE … Stündlich aktualisiert"), ProvenExpert-Zeile („5,0 von 5 · 27 Bewertungen GEPRÜFT AUF"), „Anonyme Beratung · Keine Bindung · DSGVO-konform"; Sprachumschalter zeigt für Englisch die britische Flagge (Flagge ≠ Sprache). Ergänzt Copy-Task 3. (D5)
- **Verfügbarkeitsstreifen:** alle zehn Städte zeigen „Montag, 07.09., 09:00 Uhr" – identische Zeit wirkt generiert, nicht disponiert. Entweder echte nächste Slots je Stadt oder ohne Uhrzeit. (D5)
- **RSC-Prefetch von den Subdomains** (werkstatt./flotte./makler.claimondo.de) auf claimondo.de-Routen wird per CORS geblockt (Console-Fehler auf allen Subdomain-Seiten) – Navigation fällt auf Hard-Reload zurück. (D5)
- **autounfall.io:** H1 „Nutzungs ausfall"/„Schadenfreiheits klasse" (Copy-Task 7), Eyebrow mit „6.150 SV/MO" (Copy-Task 7), Karten als einzige Inhaltsform der Startseite (7 Themen + 6 Werkzeuge, alle gleich).
- **Cluster:** vier gleichzeitige Overlays (Cookie-Karte, Siegel, WhatsApp- und Telefon-FAB), 3×2 identische Bewertungskarten, unbelegte USPs („In 60 Min vor Ort", „2.500+ Schäden", „10+ Jahre"), Mapbox-Timeout auf `/gutachter-finden` (12 s ohne load-Event, Düsseldorf), `ERR_NAME_NOT_RESOLVED` auf `/kfzgutachter-lp` (eine Ressource, Host nicht auflösbar). (D6, Copy-Task 8)

### P3 – Polish

- Skip-Link „Zum Hauptinhalt springen" ist 1×1 px bis Fokus (korrekt), aber zählt in jeder Tap-Messung mit – kein Nutzerproblem.
- Hero-Formular-Feld „Stadt/PLZ" hatte kein zugeordnetes Label (`label for="home-lead-city"` ohne passendes `id`) – 6 Sprachen. *Fix in #5868.*
- Markdown-Tabellen und Codeblöcke ohne Tastaturzugang (`scrollable-region-focusable`, 180 Messungen). *Fix in #5868.*

---

## 4 · Muster und systemische Ursachen

| Muster | Wurzel | Reichweite |
|---|---|---|
| Kontrastfehler | Opazitäts-Töne `text-claimondo-shield/50–70` statt fester Sekundärfarbe; 113 Stellen | 516–520 claimondo-Seiten je Viewport |
| Fließtext zu klein | Token `--text-body: 14px`, `text-body-sm` 13, `text-caption` 10 | 77 % aller Textknoten |
| Heading-Sprung | Footer-Spalten `h4` | 749 Seiten |
| CTA unter Overlay | Zwei fixe Ecken-Overlays (Leiste, Siegel) ohne Reservierung im Fluss; Kollisionsprüfung nur auf ein Ziel | Startseite, 36 Stadtseiten × 6 Sprachen, Check, 5 Spokes |
| Hero-Kennzahlen mit unbelegten Zahlen | `HomeTrustStripSection`, `brand-constants.ts`, Partner-Seiten | Startseite (6), Stadtseiten, Vorteile, LP, 4 Partnerseiten |
| Identische Kartengitter | `BghAuthorityGrid`, `BeweisSection`, Service-Realität, Ansprüche, `WarumCards` | 78 claimondo-, 50 Cluster-Seiten |
| Kicker-Grammatik | `text-xs uppercase tracking-[0.18em]` als Sektionsauftakt in 160 Stellen | jede Sektion |
| Lange Zeilen | Intro-Absätze ohne `max-w-prose`, 3er-Gitter-Texte | 770 Seiten Desktop |
| Cluster = 5 Kopien | kein geteilter Code; jeder Befund fünffach | 61 Seiten |

---

## 5 · Was gut ist (behalten)

- **Struktur der Zugänglichkeit stimmt:** Skip-Link, `main/nav/header/footer` auf jeder Seite, `lang` gesetzt, Fokusringe sichtbar (0 unsichtbare Tab-Stopps außer Iframes), **RTL für Arabisch funktioniert** (162/162 mit `dir=rtl`), keine Bilder ohne `alt`, kein horizontaler Overflow auf Desktop.
- **CLS nahezu null** auf 98 % der claimondo-Seiten, LCP-p90 0,8 s auf autounfall.io.
- **`/schaden-melden`**: klarer Radio-Karten-Wizard mit Erklärtext je Option, sichtbare Labels, Datenschutzsatz am Feld, Rückruf-Alternative darunter – die beste Formularseite der Property.
- **`/check`**: eine Frage pro Schritt, Fortschrittsbalken, Antworten als große Knöpfe, Auswertung mit §-Bezug.
- **`/kfz-gutachter/kosten`**: „Direkt-Antwort"-Kästen mit Quelle, BVSK-Beispiele, Frage als H2 – Referenz für alle Ratgeber.
- **`/gewinnspiel`**: einzige Seite mit „Committed"-Farbstrategie (Navy-Fläche, Creme-CTA), echtes Gründerfoto statt Stock, drei Schritte in Prosa statt Karten.
- **Drenched-Sektion „Sie reden mit niemandem. Wir mit allen."** auf der Startseite: ein Satz, ein Foto, Haltung – so klingt die Marke laut PRODUCT.md.
- **Montserrat als eine Familie mit Gewichtskontrast** (kein Reflex-Font, kein zufälliger Serif-Sans-Mix).

---

## 6 · Empfohlene Aktionen (impeccable-Kommandos, nach Priorität)

1. **[P0] `/impeccable adapt`** – Overlays und Safe-Areas: erledigt in PR #5868 (Kontaktleiste weicht vor Zielen, Siegel < 1400 px aus, Clarity/Cookie als Leisten). Offen: Regel-4-Smoke nach Deploy.
2. **[P1] `/impeccable typeset`** – `--text-body` 16 px, `max-w-prose` (65–75 ch) für Intro-/Kartentexte, Kicker-System benennen oder auf einen je Seite reduzieren. → Task D2 (Entscheidung Aaron zum Token).
3. **[P1] `/impeccable distill`** – Startseite und Stadtseiten auf eine Entscheidung je Bildschirm: Hero mit einem Primär-CTA + Telefon, Kennzahlen-Streifen raus (oder nur belegte Zahlen mit Quelle), fünf Kartengitter zu zwei Sektionen mit unterschiedlicher Struktur, Länge 30k → ≤ 12k px. → Task D3.
4. **[P1] `/impeccable optimize`** – Hero-Bilder `priority` + `sizes`, Cluster-Bilder mit Maßen und passender Größe, Hero-Höhe reservieren (CLS Hub), autounfall-Footer außerhalb der Suspense-Grenze halten. → Task D4.
5. **[P2] `/impeccable harden`** – i18n-Blöcke (Streifen, ProvenExpert, Trust-Zeile, Flagge), RTL-Overflow `ar/haftpflicht/nutzungsausfall`, `nested-interactive` (Monika-Widget, Team-Karte), `dl`-Markup, Icon-Link-Namen, Subdomain-Prefetch. → Task D5.
6. **[P2] `/impeccable layout`** + **`/impeccable colorize`** – Startseiten-Hero ohne Stockfoto (PRODUCT.md Anti-Referenz 1), „Committed"-Farbstrategie wie `/gewinnspiel` für Hero und Abschluss-CTA, Cluster raus aus Navy+Gold. Entscheidung Aaron (Markenrichtung).
7. **[P2] Cluster-Konsolidierung** – Kicker-Kontrast, Bildmaße, Overlays auf zwei reduzieren, Geviertstriche (Copy-Task 8). → Task D6.
8. **`/impeccable document`** – DESIGN.md aus `globals.css`/Tokens erzeugen, damit Kicker, Glass und Karten als System benannt (oder gestrichen) werden. → Task D7.
9. **`/impeccable polish`** als Abschluss nach D2–D6.

---

## 7 · Reproduktion

```
# Aufnahme (Session-Scratchpad, resume-fähig)
node C:/pwtool/design-crawl.mjs <urls.json> <outDir> 6
node <scratchpad>/design/aggregate.mjs <outDir>/results.jsonl aggregate.md

# Overlay-Nachmessung (nur fixed/sticky-Blocker, drei Viewports, in Halbschritten gescrollt)
node C:/pwtool/overlay-precise.mjs https://claimondo.de/ https://claimondo.de/kfz-gutachter/koeln https://claimondo.de/check

# Regel-4-Spec (Marketing-Projekt)
PLAYWRIGHT_BASE_URL=https://app.claimondo.de npx playwright test service-pitch-overlays-klickbar --project=marketing
```

Kontrastwerte: WCAG-Formel, `shield` #1E3A5F über #f8f9fb gemischt – /50 2,72 · /60 3,53 · /70 4,60 · /75 5,26 · /85 7,03; über Glas #dbdde2: /70 4,01 · /75 4,53 · /85 5,87.
