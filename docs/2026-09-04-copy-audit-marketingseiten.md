# Copy-Audit aller Marketingseiten — 04.09.2026

**Auftrag (Aaron, 04.09.):** „mit dem copywriting skill über alle marketingseiten … audite" · „wirklich alle marketingseiten" · „ich sehe, dass wir teilweise in den Überschriften noch Codezeilen stehen haben" · zusätzlich Themenfelder für neue SEO-Seiten rund um Unfall und Unfallinstandsetzung (eigenes Dokument: `docs/2026-09-04-seo-themenfelder-unfall-instandsetzung.md`). Der Änderungsplan liegt unter `docs/superpowers/plans/2026-09-04-copy-audit-umsetzungsplan.md`.

**Skills:** copywriting, copy-editing (Seven Sweeps), page-cro, section-audit, deslop, marketing-psychology, seo-geo, content-strategy, programmatic-seo.

**Messobjekt:** ausschließlich der **gebaute, ausgelieferte Output** der Live-Domains (Regel aus `COORDINATION-seo-audit-marketing-umsetzung`: „am GEBAUTEN Output messen"). Quellcode wurde nur herangezogen, um die Fundstelle für den Fix zu bestimmen.

---

## 0 · Umfang

| Property | Seiten mit HTTP 200 | Quelle |
|---|---:|---|
| claimondo.de (DE) | 416 | Sitemap 405 + 11 nicht angemeldete Seiten (`/check`, `/schaden-melden*`, `/gutachter-partner*`, `/kfzgutachter-lp`, 404-Seite, `llms*.txt`) |
| claimondo.de (en/tr/ar/ru/pl) | 410 (82 je Sprache) | 36 Sitemap-Alternates je Sprache + 46 gezielt gecrawlte Routen je Sprache (alle statischen Routen, 5 Stadtseiten, 4 Haftpflicht-, 3 Decoder-, 2 SV-, 2 Versicherer-, 2 Wissen-Seiten) |
| gutachter. / werkstatt. / flotte. / makler.claimondo.de | 4 | Subdomain-Roots (Middleware-Rewrite auf `/gutachter-partner`, `/werkstatt/partner-werden`, …) |
| app.claimondo.de/schaden-melden | 1 | Funnel-Einstieg der App (nur Überschrift/CTA geprüft) |
| autounfall.io | 257 | Sitemap 254 + `/unfall-assistance` + `llms*.txt` |
| kfz-unfallgutachter-{koeln,duesseldorf,bonn,aachen,wuppertal}.de | 55 | 5 Sitemaps (Hub + 9–12 `/lp/<ort>`) + `/gutachter-finden` |
| **gesamt** | **1.143** | |

Nicht im Umfang: die App-Portale (kein Marketing), `sv-levelup/` (Vertriebs-Tool mit Token-Routen, keine öffentliche Marketingseite).

## 0.1 · Methode

1. **Crawler** (`crawl.mjs`, Node 24, kein Playwright nötig — Next rendert den Text serverseitig): pro Seite Titel, Description, Robots, Canonical, `html lang`, alle Überschriften (mit `sr-only`-Erkennung), CTA-artige Buttons/Links im Hauptbereich, erste Absätze, Wortzahl, sichtbarer Text. React-Kommentarknoten `<!-- -->` entfernt, Entities dekodiert, `script`/`style` **non-greedy** entfernt, Redirects nicht gefolgt.
2. **Detektoren** (`analyze.mjs`, 28 Befund-Codes): Code-Artefakte in Überschriften/CTAs/Meta (Tags, Entities, Template-Platzhalter, i18n-Keys, snake_case, Markdown), ASCII-Umlaute, RDG-Verben, Superlative im Claimondo-Kontext, schwache CTAs, Du/Sie-Mix, Wir-Lastigkeit, Satzlänge, Sprachmischung auf Fremdsprach-Seiten, Titel-/Description-Länge, H1-Anzahl/-Länge, doppelte H2, Titel-Marke doppelt.
3. **Editorielle Lektüre** (Seven Sweeps: Klarheit · Ton · So-what · Beweis · Spezifik · Emotion · Risiko) der Konversionsseiten und je eines Vertreters jedes Templates: Startseite, `/schaden-melden`, `/check`, `/gutachter-finden`, `/kfz-gutachter` (Hub), `/kfz-gutachter/koeln`, `/wie-es-funktioniert`, `/vorteile`, `/was-kostet-claimondo`, `/ueber-uns`, `/faq`, `/beratung-anfragen`, `/ersteinschaetzung`, die vier Partnerseiten, `/haftpflicht` (Hub + Spoke), Decoder, Versicherer, SV, Wissen, autounfall.io (Start, Akutphase, Reparatur, Finder, SF-Klasse, Vergleich, Nutzungsausfall, pSEO-Stadt×Typ, Decoder, Artikel), Cluster-Hub Köln + Spoke Leverkusen + Hub Wuppertal, `llms.txt`.
4. **Gegenprobe der bekannten Befunde** aus den Audits A/B/E (23.08.) und dem Nacht-Audit (27.08.) am heutigen Live-Stand (§7).

**Drei Messfehler, die ich selbst getroffen und korrigiert habe** (damit sie niemand wiederholt):

* **autounfall.io streamt den Hauptinhalt hinter einer Suspense-Grenze.** `<main>` enthält im ausgelieferten HTML nur den Spinner (`<!--$?--><template id="B:0">`), der Inhalt steht weiter unten im Dokument. Wer nur `<main>` misst, sieht 250 „leere" Seiten (erster Lauf: 0 Wörter, 0 CTAs). Fallback: Body ohne Header/Nav/Footer.
* **„§ 23 Nr. 1 GVG" ist kein Superlativ.** Das Muster `Nr. 1` traf auf 180 Stadtseiten die Gerichtsstands-Zitate. Superlative zählen jetzt nur im Kontext von „Claimondo/wir/unser/Plattform/Netzwerk".
* **„ist nicht null" ist kein Code-Literal.** Deutsch für „ist nicht null" (autounfall.io, Nutzungsausfall bei Totalschaden).

**Grenzen:** keine Viewport-Messung (Overlays, Falz — dafür Audit A/D), Fremdsprachen nur als Stichprobe (82 je Sprache, nicht die ~1.100 Varianten), client-seitig nachgeladene Zustände (z. B. das `/check`-Ergebnis) nur über den Quelltext geprüft.

---

## 1 · Kurzfassung — die zwölf wichtigsten Befunde

| # | Befund | Umfang | Tier |
|---|---|---|---|
| 1 | **Code in Überschriften ist real:** `<a name="akut"></a>` steht als sichtbarer Text in 20 H2 der beiden Cornerstones `/kfz-haftpflicht-schaden` und `/ratgeber`, in allen 6 Sprachen. Zusätzlich sind die 20 Inhaltsverzeichnis-Links (`#akut`, `#frisch`, …) tot, weil der Anker als Text und nicht als HTML gerendert wird. | 12 Seiten | 2 |
| 2 | **RDG-kritische Formulierungen leben weiter** — Startseite („Wir holen es zurück.", „schreibt unser Anwalt zurück"), FAQ („Unser Anwalt kennt…"), 18 Haftpflicht-/Decoder-/SV-Seiten („Claimondo holt diese Kürzungen zurück"), Werkstatt-Partnerseite („Claimondo setzt alle Ansprüche … durch"), `kfzgutachter-lp` („Wir setzen alle Ansprüche durch"), `/check`-Ergebnis („Wir holen das Maximum für Sie heraus") und **der KI-Feed `llms-full.txt`** („Wir verhandeln…", „Wir setzen … durch", „Wir holen … ein", „klagen wir vor dem Landgericht"). | 29 Seiten-Treffer, 13 Strings | 1 |
| 3 | **„Bereits 10036 Sachverständige sind im Claimondo-Netzwerk"** ist auf gutachter.claimondo.de weiterhin live (Audit B, 23.08., Befund 1 — offen). Die Zahl sind gescrapte Adressen, echte Partner: 10. | 1 Seite + JSON-LD | 1 |
| 4 | **„über 50 Partner-Gutachter deutschlandweit"** — am 23.08. als „latent, kein Consumer" geführt — ist seit dem Gewinnspiel **live** (`/gewinnspiel`, 6 Sprachen). | 6 Seiten | 1 |
| 5 | **„Claimondo ist die bundesweit größte digitale Plattform"** steht weiter auf 12 Seiten (Cornerstone ×6 + 6 Haftpflicht-Spokes). Audit E hatte nur den i18n-Key ersetzt; die Quelle `lib/seo/brand-fakten-library.ts` / `brand-constants.ts` blieb. | 12 Seiten | 1 |
| 6 | **„Versicherer-Kürzung zurückgeholt"** (30–40 %) steht nicht nur auf `/ueber-uns` (Audit E #5), sondern auch im **Titel und H1-Akzent von `/vorteile`**, auf `/faq`, `/gutachter-finden` und im Schadensreport — 7 Keys, Fußnoten ¹/² zeigen ins Leere. | 5 Seiten | 1 |
| 7 | **`/schaden-melden` ist in en/tr/ar/ru/pl komplett deutsch** — H1, Schuldfrage, Formular, Trust-Block (27,7 % deutsche Funktionswörter; nur Nav und Meta übersetzt). Dasselbe gilt für die drei Partnerseiten (22–26 %), `/gewinnspiel` (27 %), `/kfzgutachter-lp` (21 %), `/community` (15 %). | 5 Sprachen × ~9 Seiten | 3 |
| 8 | **Zwei Cluster-Angaben widersprechen claimondo.de:** „Ø Regulierungszeit 32 Tage · branchenüblich" (Cluster) vs. „32 Tage statt 4–6 Monate Branchen-Durchschnitt" (Startseite); „Rückruf innerhalb 60 Min" (Cluster) vs. „15 Minuten" (claimondo.de); Nutzungsausfall „23–175 €" (Cluster) vs. „23–219 €" (claimondo.de nach Audit E). | 50 Seiten | 1 |
| 9 | **autounfall.io zeigt interne SEO-Metadaten:** Eyebrows wie „Verursacher-Hub · 28.750 SV/Mo", „Route 12 · Auffahrunfall · 760 SV/Mo" (13 Eyebrows, 2 Titel) und interne Labels („Pillar 04", „Dual-Hub", „Verursacher-Bridge"). Zwei H1 sind zerbrochen: „Schadenfreiheits klasse", „Nutzungs ausfall". | 15 + 2 Seiten | 2 |
| 10 | **100 pSEO-Seiten mit Grammatikfehler im Template:** „Auffahrunfall **sind** in Berlin mit 24% die **häufigste Unfall-Kategorien**." (`kfz-unfall/[stadt]/[typ]/page.tsx:98`). | 100 Seiten | 2 |
| 11 | **Titel mit doppelter Marke** „… | Claimondo | Claimondo" auf `/gutachter-finden` (de, en), `/gewinnspiel` und `/gewinnspiel/teilnahmebedingungen` (je 6 Sprachen). | 14 Seiten | 2 |
| 12 | **`/ersteinschaetzung` verspricht Foto-Upload und KI-Analyse** — beide CTAs führen auf `/check` (drei Klickfragen ohne Foto). Audit A #6, unverändert. | 1 Seite (indexiert) | 1 |

Dazu die **Massenbefunde** aus dem Aggregat: 145 Seiten mit Du/Sie-Mischung (Audit E #11, unverändert), 269 Ratgeber-Seiten, deren erster Inline-CTA erst im unteren Viertel steht, 69 Seiten mit „Mehr erfahren"/„Details ansehen" als CTA, 20 FAQ-/Text-Fragmente wie „laut ), und BGH-Leitentscheidungen".

---

## 2 · Tier 1 — Rechtlich und Vertrauen

### 2.1 RDG-Rollentrennung (Claimondo koordiniert — die Partnerkanzlei verhandelt)

Regel seit 31.05. (Aaron): *„wir verhandeln nicht, unsere Partnerkanzlei verhandelt."* Erlaubt für Claimondo: koordinieren, Kommunikation, Auszahlung, Abrechnung. Verboten: verhandeln, durchsetzen, zurückholen, klagen, geltend machen. Audit E hielt am 23.08. fest, die Trennung sei „in ~25 Textstellen diszipliniert durchgehalten". Am gerenderten Output zeigt sich heute das Gegenbild — die Verstöße sitzen nicht in `de.json`, sondern in **TS-Konstanten, Komponenten-Defaults und Seiten-Dateien**, die Audit E nicht gescannt hat:

| Wo (live) | Text | Quelle |
|---|---|---|
| Startseite, BGH-Sektion | „Versicherer kürzen trotzdem. **Wir holen es zurück.**" | `components/landing/sections/BghAuthorityGrid.tsx:47` (Default-Subline) |
| Startseite, Plattform-Mechanik Schritt 3 | „…schreibt **unser Anwalt** zurück – bevor Sie „Wartezeit" tippen können." | `lib/brand/service-pitch.ts:120` (`PLATTFORM_MECHANIK_STEPS[2].body`) — auch in `llms-full.txt` |
| Startseite, Prozess Schritt 4/5 | H3 „**Wir treiben** die Versicherung **in Verzug**" · H3 „**Wir zahlen** Ihnen **aus**" | `de.json` `home.prozess.steps[3].titel`, `[4].titel` |
| Startseite, Taktik-Tabelle | „**Anwalt klagt** vor dem zuständigen Landgericht" (ohne „Partnerkanzlei") | `home.versicherer_taktiken.taktiken[5].gegenargument` |
| `/faq` | „**Unser Anwalt** kennt die versicherungsspezifischen Taktiken" | `faq.groups[1].fragen[2].antwort` |
| `/faq` KPI-Streifen | „Versicherer-Kürzung **zurückgeholt**¹" | `faq.trust_strip.labels[3]` |
| 18 Seiten `/haftpflicht/*`, `/decoder/*`, `/sachverstaendige/pruefdienstleister` (Box „Auf einen Blick – gesicherte Fakten") | „30 bis 40 Prozent … gekürzt – **Claimondo holt diese Kürzungen zurück**" | `lib/seo/brand-fakten-library.ts:104` (Fakt F55), gerendert über `CitationBox.tsx`/`VrBaitBlock.tsx` |
| werkstatt.claimondo.de (Schritt 03) | „Sie reparieren, wir regulieren … **Claimondo setzt alle Ansprüche** gegen die gegnerische Versicherung **durch**" | `app/[locale]/werkstatt/partner-werden/page.tsx:93` |
| `/kfzgutachter-lp` (noindex, aber live; Root- und Locale-Fassung) | „**Wir setzen alle Ansprüche durch**"; Sub-Headline „…führen die Versicherungs-Verhandlung und setzen Ihren Anspruch BGH-konform durch" | `app/kfzgutachter-lp/page.tsx:287`, `app/[locale]/kfzgutachter-lp/page.tsx:285`, `service-pitch.ts:41` |
| `/check` (Ergebnisschirm, client-seitig) | „**Wir holen das Maximum für Sie heraus.**" | `de.json` `check.result_quote_sub` |
| `llms-full.txt` (KI-Feed) | „**Wir verhandeln** vollständige Erstattung…", „**Wir setzen** die Wertminderung … **durch**", „**Wir holen** Gutachter- und Anwaltskosten … **ein**", „Im Streitfall **klagen wir** vor dem zuständigen Landgericht", „BGH-konform **durchgesetzt**" | `service-pitch.ts` `ANSPRUECHE_REFRAMED` (137–158), `SERVICE_PITCH_BRAND_BLOCK` (229), `lib/faq/faqs.ts:293` |

**Grauzone, Entscheidung der Partnerkanzlei:** „Claimondo … **reguliert** mit der gegnerischen Haftpflichtversicherung" (flotte./werkstatt.claimondo.de), „**BGH konforme Durchsetzung**" (Kachel makler.claimondo.de), „**Durchsetzung aller Ansprüche** nach §249 BGB" (makler), „anwaltliche Durchsetzung über die Partnerkanzlei LexDrive" (`/ueber-uns` — korrekt attribuiert).

**Warum das zählt:** Wer die Gespräche führt, ist eine Rechtsaussage (§ 3 RDG), keine Stilfrage (Kommentar in `service-pitch.ts:163` sagt das selbst). Der KI-Feed ist dabei die exponierteste Stelle — eine KI, die `llms-full.txt` liest, zitiert Claimondo als Verhandler. Dieser Widerspruch Seite ↔ Feed war am 20.08. (#5444) als Einzelfall gemeldet; er ist ein Muster: `service-pitch.ts` trägt den **alten** Pitch und speist Startseiten-Sektionen und beide Feeds.

### 2.2 Zahlen, die nicht belegbar sind (UWG § 5)

| Aussage | Wo | Stand Prod (Audit B/E, 23.08.) | Status |
|---|---|---|---|
| „Bereits **10036** Sachverständige sind im Claimondo-Netzwerk." (+ JSON-LD `Service.description`) | gutachter.claimondo.de | `sv_leads` = gescrapte Adressen, 0 beansprucht; echte aktive verifizierte SV: **10** | Audit B #1 — **offen**, Zahl seit 23.08. um 2 gestiegen (10034 → 10036) |
| „**über 50** Partner-Gutachter deutschlandweit" | `/gewinnspiel` (`page.tsx:79`), `landing.hero.trust_badge` | 10 | Audit E „latent" → **jetzt live** |
| „**2.000+** vermittelte Schadensfälle · **8 Mio. €+** Schadensersatz durchgesetzt · **32 Tage** Ø · Stand 14.05.2026 · Methodik auf Anfrage" | Startseite KPI-Band, `/vorteile` | 75 Claims, 0 Abrechnungen, erster Claim 15.07. | Audit E #2 — **offen** (Aaron prüft Herkunft) |
| „Claimondo ist die **bundesweit größte** digitale Plattform…" | 12 Seiten (s. o.) | 10 SV | Audit E #3 — **halb**: Key ersetzt, Bibliothek nicht |
| „**Hunderte** BVSK-zertifizierte Sachverständige" · „hunderte zertifizierte Sachverständige **in allen 16 Bundesländern** – Termin überall … in unter 48 Stunden" | `llms.txt` USP 5 (`service-pitch.ts:214`), `/sachverstaendige/bvsk` Fakten-Box | 10 SV, Polygone nur in NRW-Städten (Memory Hyperlokal P2) | **neu** |
| „30–40 % Versicherer-Kürzung **zurückgeholt**" | `/ueber-uns` (²), `/vorteile` (Titel `page_meta.vorteile.title`, `vorteile.hero.h1_accent`, `vorteile.kpis[0]`), `/faq`, `/gutachter-finden` (`gutachter_finden.kpis[3]`), Schadensreport | belegt ist die Kürzungsquote, nicht eine Rückholquote | Audit E #5 — **offen und breiter als gemeldet** |
| Cluster-LPs: „**2.500+** Schäden begleitet", „**10+** Jahre Erfahrung", „In **60 Min** vor Ort", „**+ 2.805 €** im Schnitt mehr für unsere Mandanten" (5 „anonymisierte Realfälle") | alle 50 Cluster-Seiten | Herkunft im Code als Aaron-kuratiert vermerkt (`lib/content.ts`), aber ohne Quelle auf der Seite | **Beleg einholen** — dieselbe Klasse wie das KPI-Band |
| „Partner-Netzwerk · PLZ 50–51" als Untertitel unter **92 Stadt-Kacheln** | `/kfz-gutachter` Hub | Netzwerk mit Polygon-Deckung nur in ~7 NRW-Städten | **Formulierung** („Partner-Netzwerk" suggeriert lokale Partner überall) |

### 2.3 Versprechen ohne Funktion

* **`/ersteinschaetzung`** — H1 „Unverschuldeter Unfall? 0 € Eigenkosten für Sie.", darunter „Fotos hochladen … KI analysiert sofort … Ergebnis in Minuten"; beide CTAs (`Jetzt kostenlos einschätzen lassen`, `Ersteinschätzung starten`) → `/check` (drei Klickfragen, kein Upload). Audit A #6, unverändert. Die Seite ist indexiert und trägt die Zusage auch im JSON-LD.
* **gutachter.claimondo.de** — Hero: „Wir nehmen Partner **regional gestaffelt** auf – sobald Ihre Region dran ist, melden wir uns." Zwei Bildschirme tiefer: „Sie schalten sich **selbst frei, ohne Wartezeit**." FAQ: „Nach Freischaltung Ihrer Region: **7 bis 14 Werktage**". Audit B #2, unverändert (fünf widersprüchliche Zeitangaben).
* **makler.claimondo.de** — Abschluss „Partnerschaft anfragen. … **In 24 Stunden Rückmeldung.**" mit Button „Jetzt kostenlos registrieren" (Selbstregistrierung, 11 Felder). Audit B #9, unverändert.
* **Startseite** — Titel „Kfz-Gutachter-**Termin online buchen** – ohne Anruf, 0 €" (Suchintention: Termin buchen), H1 „Unverschuldet im Unfall? Wir haben's im Griff." (Intention: Fall abgeben). Wer über den Titel kommt, sucht den Buchungsknopf; der Hero-CTA „Lassen Sie uns mit der Versicherung reden →" führt auf `/gutachter-finden`. Botschaft und Weg passen nicht zueinander (Message-Match, page-cro §2).

---

## 3 · Tier 2 — Kaputte Texte, Code in Überschriften

### 3.1 HTML-Anker als sichtbarer Text (Aarons Beobachtung)

`content/claimondo/cornerstones/kfz-haftpflicht-schaden.md` (12 H2, Zeilen 70–379) und `cornerstones/ratgeber.md` (8 H2, Zeilen 43–337) setzen Anker als rohes HTML in die Überschrift:

```
## <a name="akut"></a>1. Die ersten 72 Stunden – Sofort-Maßnahmen
```

`MarkdownRenderer.tsx` (react-markdown ohne `rehype-raw`) escaped rohes HTML — der Leser sieht wörtlich `<a name="akut"></a>1. Die ersten 72 Stunden` als Überschrift, in allen 6 Sprachen (`/kfz-haftpflicht-schaden`, `/ratgeber` je ×6 = 12 Seiten). Zwei Folgeschäden: (a) `rehype-slug` bildet die Heading-ID aus dem Text inklusive des Anker-Mülls, (b) das Inhaltsverzeichnis im Markdown (`[…](#akut)`, Zeilen 55–62) verlinkt auf IDs, die es nicht gibt — **20 tote Sprungmarken**. Die Screenreader-Variante liest „kleiner-als a name gleich akut …" vor.

### 3.2 Text-Fragmente durch entfernte Links (FAQ)

`de.json`:

* `faq.groups[0].fragen[1].antwort`: „…so lautet die quotierte Bandbreite von Versicherer-Prüfdienst-Kürzungen **laut ), und** BGH-Leitentscheidungen…" — eine Quelle wurde entfernt, Klammer und Komma blieben.
* `faq.groups[1].fragen[0].antwort`: „…die ohne Fahrzeugbesichtigung Positionen streichen. **VI ZR 174/24) – aber nur** wer widerspricht…" — Satzanfang fehlt, schließende Klammer verwaist.

Beide Antworten stehen im FAQPage-Schema; Google kann sie als Rich Result ausspielen.

### 3.3 Marke doppelt im Titel (14 Seiten)

`/gewinnspiel` (6 Sprachen), `/gewinnspiel/teilnahmebedingungen` (6), `/gutachter-finden` (de, en): „Täglich 3 × 50 € Gutschein gewinnen **| Claimondo | Claimondo**". Ursache: die Seite setzt `title: '… | Claimondo'` (`gewinnspiel/page.tsx:40`), das Layout hängt das Template ein zweites Mal an — die Klasse aus #5352/#5435 („Layout hängt die Marke ohnehin an").

### 3.4 autounfall.io — interne Metadaten und zerbrochene Wörter

* **Suchvolumen im sichtbaren Eyebrow/Titel** (aus `content/rest-pages.generated.ts`, 15 Stellen): „Verursacher-Hub · 28.750 SV/Mo" (`/schadenfreiheitsklasse`), „Schadensposition · §249 BGB · 6.150 SV/Mo" (`/nutzungsausfall`), „Personenschaden · §253 BGB · 5.650 SV/Mo", „Dual-Hub · Verursacher + Opfer · 16.000 SV/Mo", „Verursacher-Bridge · 5.500 SV/Mo", „Schadens-Bewertung · 7.100 SV/Mo", „SF-Klassen · Übertragung · 3.300 SV/Mo", „SF-Klassen · Detail-Tabelle · 2.500 SV/Mo", „Route 12 · Auffahrunfall · 760 SV/Mo", „Route 13 · Bußgeld + Haftpflicht · 630 SV/Mo", „Route 14 · Optimierung · 1.330 SV/Mo", „Versicherungs-Kürzung · 250/500 SV/Mo" — und im **Titel** von `/schadenfreiheitsklasse/rabattschutz` („… · 1.330 SV/Mo"). Das ist die Keyword-Recherche der Redaktion, nicht Leser-Information.
* **H1 mit Leerzeichen im Wort:** „Schadenfreiheits klasse" (`rest-pages.generated.ts:509`), „Nutzungs ausfall" (`:462`) — vermutlich als manueller Umbruch gedacht, gerendert als zwei Wörter (auch für Google und Screenreader).
* **Interne Taxonomie sichtbar:** „Pillar 01 · Akutphase", „Pillar 04 · Reparatur & Werkstatt" als Eyebrow und Breadcrumb-Ebene; auf claimondo.de analog „Cluster H1/H3" auf `/haftpflicht` und der CTA „**Im Cluster ansehen** →" (7× auf der Startseite).
* **pSEO-Template (100 Seiten `kfz-unfall/[stadt]/[typ]`):** „Auffahrunfall **sind** in Berlin mit 24% die **häufigste Unfall-Kategorien**." (`page.tsx:65–98`: Singular-Typ + Plural-Verb + Plural-Nomen). Dazu „Anfrage über autounfall.io · Match in 24 Stunden" — die Zahl „ca. 142 BVSK-zertifizierte Sachverständige" pro Region ohne Quelle.
* **„Sie nutzt das Fahrzeug mindestens sechs Monate weiter"** (2× auf `/versicherer-decoder/130-prozent-verweigert`, `content/decoder-data.generated.ts:41`) — Rest einer Du→Sie-Umstellung.
* **`/anspruch`:** „ControlExpert **&amp;** Co." — doppelt kodiert.
* **Zwei „Stand"-Angaben auf derselben Seite:** Kopf „Stand: Juni 2026" (`SITE.contentStand`), Fuß „Stand: September 2026" (generiert) — z. B. `/fiktive-abrechnung`.
* **„Verwandte Themen" zweimal als H2** auf 14 Seiten (Schmerzensgeld-/WBW-Cluster).
* **H1 = ein Wort:** „Akutphase" (`/unfall-was-tun`, Titel: „Was tun in den ersten 24 Stunden?"), „Schuldfrage" (`/wer-hat-schuld`). Die Frage steht im Titel, die H1 trägt nur das Etikett.

### 3.5 claimondo.de — weitere Text-Defekte

* `/haftpflicht`: H2 „**Standard-Unfaelle**", „**Komplexe Faelle**" (`app/[locale]/haftpflicht/page.tsx:32–33`, ASCII-Umlaute im Frontend — verstößt gegen die Umlaut-Pflicht in AGENTS.md).
* `/ueber-uns`: drei Sätze ohne die nötigen Kommas — „Wir sind die Plattform**,** die Geschädigten gibt**,** was ihnen zusteht – nicht das**,** was die Versicherung…", „Claimondo existiert**,** weil das Standard ist und nicht Ausnahme", „Wer ohne Anwalt reguliert**,** akzeptiert die erste Kürzung".
* Dasselbe Zitat mit zwei Urhebern: „Es geht nicht darum wer ich bin, sondern was ich tue." — Startseite „– **Batman**" (`home.founder.founders[1].quote`), `/ueber-uns` „– **Bruce Wayne**" (`ueber_uns.founders.items[1].quote_autor`). Nacht-Audit 27.08. #1 (Aaron-Entscheid offen); das Henry-Ford-Zitat daneben ist ein bekanntes Fehlzitat.
* `/gutachter-finden`: Titel 71 Zeichen (doppelte Marke), `sr-only`-H1 mit **106 Zeichen** („Kfz-Gutachter in Ihrer Nähe finden und Termin direkt online buchen – ohne Anruf, kostenfrei nach § 249 BGB"); `/werkstatt-finden`: H1 128 Zeichen, sichtbarer Text der Seite 19 Wörter (der Finder läuft im iframe — bekannt, Nacht-Audit #2).
* Cluster-LPs (alle 50): H2 „…Wir geben Ihnen die komplette **Lösung .**" und „Vor Ort in Köln & im Rheinland **.**" — Leerzeichen vor dem Punkt (Span + Satzzeichen); Schritt-Label „**~TAG 32 €** Geld auf dem Konto" (verirrtes €-Zeichen); H3 „Mietwagen oder Geld **ⓘ**" (Icon als Überschriftentext); die H1 trägt die Subline mit: „Kfz-Gutachter Köln Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard." (91–97 Zeichen, drei Sätze in einem `<h1>`); die sechs Schritt-H3 stehen doppelt im DOM (Mobil- und Desktop-Variante beide gerendert).
* `llms.txt`/`llms-full.txt`: 25 ASCII-Umlaute (claimondo.de: „ueber, schaeden, pruefen, Kuerzungen, zurueck"), 8 auf autounfall.io („waehlen, erklaert, fuer, hoehe, kuerzung, pruefen"). Für ein Dokument, das KI-Systeme wörtlich zitieren, ist das Markenschaden.

---

## 4 · Tier 3 — Sprache auf Konversionsseiten (i18n)

Gemessen als Anteil deutscher Funktionswörter am Fremdsprach-Text (≥ 20 % = Seite ist im Kern deutsch; die vollständig übersetzten Seiten wie `/vorteile`, `/wie-es-funktioniert` liegen bei 0–3 %):

| Seite (je en/tr/ar/ru/pl) | deutsch | Ursache |
|---|---:|---|
| **`/schaden-melden`** (Funnel-Einstieg) | **27,7 %** | `app/[locale]/schaden-melden/page.tsx` — H1, Schuldfrage, Formularlabels, Einwilligung, Rückruf-Hinweis hartkodiert; nur Nav + Meta übersetzt |
| `/gewinnspiel`, `/gewinnspiel/teilnahmebedingungen` | 27–28 % | `gewinnspiel/page.tsx` ohne `getTranslations` |
| `/werkstatt/partner-werden`, `/makler/…`, `/flotte/…` | 22–26 % | die drei `page.tsx` ohne `getTranslations` |
| `/kfzgutachter-lp` | 21 % | hartkodiert |
| `/community`, `/community-regeln`, `/kommentar-regeln` | 15–25 % | hartkodiert; `/community` hat außerdem **keine H1** (6 Sprachen) |
| `/kfz-gutachter/nutzungsausfall` | 17 % | teilübersetzt (Rechner-Labels deutsch) |
| `/ratgeber`, `/autor/aaron-sprafke`, `/wissen`, Rechtsseiten | 19–27 % | teils by design (Rechtstexte) |
| Trust-Block „Mit anerkannten Partnern · Zertifizierte Sachverständige · BVSK-Mitglieder · Fachanwalt-Netzwerk" | auf `/ar/check`, `/tr/schaden-melden` u. a. deutsch | `components/landing/TrustBlock.tsx` hartkodiert |
| Footer-Überschrift „Top-Standorte" | auf allen Fremdsprach-Seiten deutsch (H4) | `components/landing/LandingFooter.tsx:242` |
| Skip-Link „Zum Hauptinhalt springen", Button „Menü" | überall deutsch | Layout |

**Bekannt und bewusst** (nicht neu gemeldet): die Bodies von `/haftpflicht`, `/decoder`, `/sachverstaendige`, `/wissen` bleiben deutsch mit `MdxLanguageBanner` (Nacht-Audit Teil 4); die Stadtseiten tragen 7–11 % deutschen Lokalinhalt (Lokalinhalte-Lane, `COORDINATION-marketing-skills-zwei-lanes-abgrenzung`).

**Empfehlung zur Abgrenzung:** Der Funnel (`/schaden-melden`, Trust-Block, Footer) muss übersetzt werden — dort landet der Klick. Für die B2B-Partnerseiten, das Gewinnspiel und die LP sollten die Fremdsprach-URLs **nicht** als eigene Seiten existieren (Canonical auf `de`, kein hreflang), statt fünf halbdeutsche Kopien zu indexieren.

---

## 5 · Tier 4 — Copy-Qualität (Seven Sweeps)

### 5.1 Startseite (`/`)

* **Klarheit:** zwei Hero-Botschaften konkurrieren — H1 „Unverschuldet im Unfall? Wir haben's im Griff." und weiter unten als H2 der alte Pitch „Sie reden mit niemandem. Wir mit allen." (`service-pitch.ts:28`, Playwright-Tests `hero`/`konsistenz` seit 20.08. rot, Aaron-Entscheid offen). Titel↔H1-Mismatch (§2.3).
* **Ton:** durchgehend Sie, klar, mutig („Kein Call-Center-Roulette") — gut. „Batman" bricht den Ton.
* **So what / Spezifik:** Sub-Headline trägt vier Zahlen (0 €, § 249, 32 Tage, 4–6 Monate); die Ansprüche-Karten erklären UPE/Verbringung/Beilackierung jetzt in Laiensprache (Audit E #6 umgesetzt ✓).
* **Beweis:** ProvenExpert 5,0/27 ✓, 8 BGH-Aktenzeichen ✓ — aber KPI-Band und „4–6 Monate Branchen-Durchschnitt" (4× ohne Quelle) ✗.
* **Emotion:** gut („Push: Geld ist da.", „um 3 Uhr morgens").
* **Risiko:** „Anonyme Beratung · Keine Bindung · DSGVO-konform" ✓; 750-€-Grenze und Teilschuld-Quote stehen erst in der FAQ (Audit E #8 offen).
* **CTAs:** „Details ansehen" ×5 (Prozess), „Im Cluster ansehen →" ×7 (BGH-Grid — „Cluster" ist Redaktions-Jargon), „Alle Themen ansehen →" ×2; **0 Links auf `/check`**, den besten Funnel (Audit A #4 offen: 3× `/schaden-melden`, 3× `/gutachter-finden`, 0× `/check`, 0× `/beratung-anfragen`). 2.870 Wörter, 93 interne Links.
* **Struktur:** „Wir zahlen Ihnen aus" (Schritt 5) ist sachlich falsch — die Versicherung zahlt; Claimondo koordiniert die Auszahlung.

### 5.2 `/kfz-gutachter` (Hub) und Stadtseiten

* Hub: **170 H3** (92 Stadtkacheln + 9 Ratgeberkacheln + Fahrzeugtypen) — die Stadtliste als Überschriftenhierarchie; jede Kachel mit „Partner-Netzwerk · PLZ …" (§2.2). „Mehr erfahren" ×9 als Link-Text. **Dritte Honorar-Spanne lebt weiter:** „typischerweise zwischen **600 € und 2.400 €**" — Audit E hatte auf 300–1.200 € (bis 2.500 €) vereinheitlicht; der Hub wurde nicht erfasst.
* Stadtseite Köln: Intro-Satz mit **54 Wörtern** („Ob nach einem Auffahrunfall auf den Kölner Ringen, einem Spurwechsel-Crash …", `lib/kfz-gutachter/staedte.ts`, Hub-Daten — gleich in allen 6 Sprachen), sonst spezifisch und lokal stark (Gerichte, Achsen, Hotspots) ✓.

### 5.3 `/wie-es-funktioniert`, `/vorteile`, `/was-kostet-claimondo`

* „Mehr erfahren" ×7 auf beiden ersten Seiten; `/vorteile` Titel und H1-Akzent „Kürzungen zurückgeholt" (§2.2).
* `/was-kostet-claimondo` beantwortet die Geldfrage ehrlich (Vermittlungsgebühr der SV) ✓ — Vorbild für die Partnerseiten (Audit B #3).

### 5.4 `/ueber-uns`, `/faq`, `/beratung-anfragen`, `/ersteinschaetzung`

* `/ueber-uns`: wir-lastig (11 „wir/unser" : 4 „Sie") — als Über-uns-Seite vertretbar, aber das Manifest-Intro hat drei Kommafehler (§3.5), Fußnoten ¹/² ohne Referent (Audit E #5), „Bruce Wayne".
* `/faq`: 43 Fragen, gute Frage-Überschriften (Sweep „Klarheit" ✓); zwei Fragmente (§3.2); „Unser Anwalt" (§2.1); „zurückgeholt¹".
* `/beratung-anfragen`: Copy in Ordnung, aber kein Formular (Audit A #5 offen).
* `/ersteinschaetzung`: §2.3.

### 5.5 Partnerseiten (B2B)

Alle vier Befunde von Audit B (10036 · Warteliste · unbezifferte Provision · kein „wie es weitergeht") sind live unverändert; dazu: Claim-Flow duzt weiter („Finde deinen Eintrag · Suche nach deinem Namen, deiner Firma", H2 direkt unter dem Sie-Hero), und **zwei H1** auf gutachter.claimondo.de (`sr-only` „Als Kfz-Sachverständiger Claimondo-Partner werden – kostenlos registrieren" + sichtbar „Werden Sie Claimondo-Partner in Ihrer Region"). Die Hero-Zeile der drei klassischen Partnerseiten („Kostenlos gelistet · Aufträge über den Finder · Provision nur auf Erfolg") bleibt das beste Muster der Site ✓.

### 5.6 Cluster-LPs (5 Domains × 10–13 Seiten)

* **Stärke:** die fünf „Realfälle" (Schnellangebot 2.800 € → Anspruch 5.100 €, Positions-Aufschlüsselung mit Aktenzeichen) sind das spezifischste Beweis-Modul aller Properties ✓ — sofern die Zahlen belegt sind (§2.2).
* **Schwächen:** H1 mit Subline (§3.5); „Mehr erfahren" als Hero-Sekundär-CTA auf jeder Seite; die Timeline-Beschriftungen („~TAG 32 €", „ⓘ"); **Zahlen weichen von claimondo.de ab** (60 Min Rückruf, 23–175 €/Tag, „branchenüblich 32 Tage" — auf claimondo.de sind 32 Tage ausdrücklich *nicht* branchenüblich, sondern der Vorsprung). Ein Leser, der beide Domains sieht (Google zeigt sie nebeneinander), bekommt zwei Wahrheiten.
* Near-Duplicate-Lage der Spokes (75–88 %) ist bekannt (`AUDIT-cluster-domains-near-duplicate`) und kein Copy-, sondern ein Substanz-Thema.

### 5.7 autounfall.io

* **Stärken:** „Quick Answer" zuerst, FAQ-Block mit Schema, Tabellen, konsequent Sie, „Keine Rechtsberatung"-Hinweis — GEO-tauglich (Antwort-zuerst, Statistik, Zitierbarkeit) ✓. Der kontextsensitive Artikel-CTA (SFK-Variante) ist gut begründet.
* **Schwächen:** interne Metadaten (§3.4), H1-Etiketten, pSEO-Grammatik, der einzige CTA sitzt am Seitenende (Ø 672 Wörter, 7 Seiten ohne jeden CTA: Vergleichs-Hub, Rechner), „Stand"-Widerspruch, `&amp;`.
* **Marken-Trennung:** autounfall.io nennt Claimondo nur in den 8 Vergleichsseiten und pitcht „Match in der Regel binnen 24 Stunden" — konsistent mit dem Standalone-Konzept ✓.

### 5.8 Anrede und CTAs (Massenbefunde)

* **Du/Sie auf einer Seite:** 145 Seiten — 63 `/haftpflicht/*`, 57 `/wissen/*`, 12 `/decoder/*`, 8 `/sachverstaendige/*`, dazu Startseite-nahe Seiten. Ursache wie in Audit E #11: Spoke-Bodies duzen, CTA-Band „Unverschuldeter Unfall? **Hol dir**, was **dir** zusteht." (`content.cta_band.headline_default`, 38 Einbindungen) und Chrome siezen. Google-Snippet siezt, erster Satz duzt.
* **Schwache CTAs:** 69 Seiten mit „Mehr erfahren" (Cluster 50, `/wie-es-funktioniert` 7, `/vorteile` 7, Hub 9), „Details ansehen" (Startseite 5), „Mehr lesen" (`/kfzgutachter-lp` 6).
* **CTA-Position auf Ratgeberseiten:** auf 173 claimondo.de-Inhaltsseiten (89 Wissen, 63 Haftpflicht, 12 Decoder, 9 SV) erscheint der erste Inline-CTA („Anspruch prüfen ›") erst bei ~78 % der Seite — die Sticky-Leiste liegt außerhalb und wurde nicht mitgezählt; ein Antwort-zuerst-CTA nach der „Kurz erklärt"-Box fehlt.

---

## 6 · Was gut ist — bitte nicht anfassen

* `/kfz-gutachter/kosten`, `/versicherung-schickt-gutachter`, `/kfz-gutachter/sachverstaendiger-vs-gutachter` (Audit E) — weiterhin die Referenzseiten: Frage als Überschrift, Antwort als erstes Wort.
* `/check`: drei Klickfragen, Fortschritt, erst Gegenwert, dann Kontakt (Audit A) — braucht nur einen Link von der Startseite und einen RDG-sauberen Ergebnissatz.
* Die Schuldfrage als erster Schritt auf `/schaden-melden` und `/check`.
* Die Hero-Zeile der Partnerseiten; „Aufträge sind nicht exklusiv" auf gutachter.claimondo.de.
* Die Ansprüche-Karten der Startseite nach Audit E (Fachwort in Klammern, Zahl davor).
* autounfall.io: Quick-Answer-Struktur, FAQ-Schema, Tabellen, Rechner; die Cluster-„Realfälle".
* Umlaute im Frontend: außer den drei Stellen in §3.5 sauber; keine Ausrufezeichen in H1–H3 auf 1.143 Seiten; kein englischer CTA auf deutschen Seiten; keine rohen i18n-Keys mehr (Nacht-Audit #5673 hält).

---

## 7 · Gegenprobe der bekannten Befunde (Stand 04.09., live)

| Audit | Befund | heute |
|---|---|---|
| A #1 | ProvenExpert-Siegel verdeckt H1 mobil | nicht gemessen (kein Viewport in diesem Audit) |
| A #3 | `/gutachter-finden` 6–7 s bis interaktiv | **behoben** (#5848, 04.09., Isochronen 3,8 MB → 721 kB) |
| A #4 | Startseite verlinkt `/check` nicht | **offen** (0 Links, gemessen) |
| A #5 | `/beratung-anfragen` ohne Formular | **offen** |
| A #6 | `/ersteinschaetzung` verspricht Foto-KI | **offen** |
| B #1 | 10034 Sachverständige | **offen** (jetzt 10036) |
| B #2 | fünf Freischaltungs-Aussagen | **offen** (alle fünf live) |
| B #3 | Provision unbeziffert | **offen** |
| B #5 | zwei H1 auf `/gutachter-partner` | **offen** |
| B #6 | Claim-Flow duzt | **offen** |
| B #9 | Makler-CTA „24 Stunden Rückmeldung" | **offen** |
| E #1 | Rückruf 5 vs. 15 Min | **behoben** (15 Min · 8–20 Uhr, live) |
| E #2 | KPI-Band 2.000+/8 Mio/32 Tage | **offen** (Aaron) |
| E #3 | „bundesweit größte" | **halb** — Key ersetzt, `brand-fakten-library`/`brand-constants` liefern es auf 12 Seiten |
| E #4 | 32 Tage vs. 6–8 Wochen | **behoben** auf claimondo.de; Cluster sagt „branchenüblich" |
| E #5 | „zurückgeholt" + leere Fußnote | **offen**, auf 5 Seiten statt 1 |
| E #6/#7 | Fachbegriffe unerklärt | **behoben** (Startseite, FAQ) |
| E #8 | 750-€-Grenze im Hero | **offen** |
| E #9 | drei BVSK-Spannen | **halb** — Hub sagt weiter 600–2.400 € |
| E #10 | drei Nutzungsausfall-Spannen | **halb** — Cluster sagt 23–175 € |
| E #11 | Du/Sie | **offen** (145 Seiten) |
| E latent | „über 50 Partner-Gutachter" | **jetzt live** (Gewinnspiel) |
| Nacht #1 | Bruce Wayne / Henry Ford | **offen** (+ „Batman" auf der Startseite) |
| Nacht #2 | Werkstatt-Finder ohne H1 | **offen** (128-Zeichen-sr-only-H1 im Wrapper) |
| Nacht i18n | rohe Keys auf `/ar|pl|ru/check` | **behoben** (0 rohe Keys auf 1.143 Seiten) |

---

## 8 · Anhang

### 8.1 Aggregat (Seiten mit mindestens einem Treffer)

| Befund | claimondo.de (alle Sprachen) | Partner-Subdomains | autounfall.io | Cluster (5) | gesamt |
|---|---:|---:|---:|---:|---:|
| code_in_heading | 12 | 0 | 0 | 0 | 12 |
| title_brand_twice | 14 | 0 | 0 | 0 | 14 |
| h1_missing | 7 (+ llms.txt) | 0 | 1 | 0 | 8 |
| h1_long (> 90 Zeichen / > 15 Wörter) | 7 | 0 | 1 | 50 | 58 |
| h1_short (< 12 Zeichen) | 6 | 0 | 3 | 0 | 9 |
| RDG-Treffer (7 Muster) | 27 | 1 | 1 | 0 | 29 |
| superlative_claim (Claimondo-Kontext) | 8 | 0 | 2 | 1 | 11 |
| umlaut_ascii | 3 | 0 | 6 | 0 | 9 |
| du_sie_mix | 144 | 1 | 0 | 0 | 145 |
| cta_weak | 19 | 0 | 0 | 50 | 69 |
| cta_late (erster CTA > 50 % der Seite) | 266 | 0 | 3 | 0 | 269 |
| cta_missing | 7 | 0 | 2 | 5 (nur 404) | 14 |
| lang_mix_de (Fremdsprach-Seite > 6 % dt.) | 213 | – | – | – | 213 |
| long_sentence (> 32 Wörter im Intro) | 127 | 0 | 11 | 0 | 138 |
| title_long (> 60) | 198 | 0 | 1 | 2 | 201 |
| description_long (> 165) | 92 | 0 | 10 | 0 | 102 |
| h2_duplicate | 0 | 0 | 14 | 0 | 14 |
| main_streamed (Suspense-Fallback in `<main>`) | 0 | 0 | 247 | 0 | 247 |

Durchschnittliche Wortzahl im Hauptbereich: claimondo.de (DE) 1.742 · autounfall.io 672 · Cluster-Hubs 4.400–5.500.

### 8.2 Reproduktion

```
# Scratchpad dieser Session (Crawler, Detektoren, Rohdaten):
#   crawl.mjs      → crawl/pages.jsonl + crawl/text/*.txt   (CONC=4 node crawl.mjs; ~70 s)
#   analyze.mjs    → crawl/findings.json + crawl/summary.md
#   show.mjs <dir> <maxChars> <url…>  → gerenderter Text einer Seite
# Beide Skripte liegen im Plan-Task 10 als Repo-Version (scripts/copy-lint/) vor.
```

Quellorte der Fixes je Befund: siehe Umsetzungsplan.


---

## 9 · Zweiter Durchgang — Formulare, Popups, Lead-Magnets, Tracking, A/B, DSGVO-Marketing

**Auftrag (Aaron, 04.09., zweite Runde):** „lead-magnets, popup-cro, form-cro, analytics-tracking, ab-test-setup, dsgvo-email-marketing — ziehe diese auch hinzu, geh damit auch nochmal rüber, bevor wir bauen." Messobjekt hier: der Code der Formulare, Overlays und Tracking-Schichten (`claimondo-marketing/components`, `lib/analytics`, `lib/actions`, `src/lib/cold-mail`, `src/lib/email`), die Deploy-Workflows und die Rohdaten aus §0.

### 9.1 Formulare (form-cro)

| Formular | Felder | Labels | Fehler | Bot-Schutz | Tracking | Befund |
|---|---|---|---|---|---|---|
| Startseite Rückruf (`HomeLeadFormClient`) | 3 (Name, Telefon, Stadt/PLZ) | sichtbar ✓ | inline je Feld ✓ | **kein Honeypot** | `generate_lead` ✓ | Vorbild bis auf den fehlenden Honeypot (Stadt- und Gewinnspiel-Form haben ihn) |
| `/schaden-melden` (`MiniWizardClient`) | 8 + Einwilligung | sichtbar ✓ | zod inline ✓ | — | nur serverseitig `generate_lead` für qualifizierte Leads | kein Fortschritt („3 Blöcke"), **kein `form_start`-Event** → Abbruchquote nicht messbar; 5 Sprachen deutsch (§4) |
| `/check` (`CheckFunnelClient`) | 3 Klickfragen + 3 Felder | ✓ | ✓ | — | `check_start/step/complete` + `generate_lead` ✓ | best instrumentiertes Formular der Site |
| Stadtseiten (`StadtLeadFormClient`, 183 Seiten) | 3 | ✓ | Toast | Honeypot ✓ | `gtag` direkt (nicht `trackEvent`) | seit #5499 lebendig (`/api/anfrage-from-lp`); Tracking-Pfad abweichend |
| Gewinnspiel | 2 + Ja/Nein + Einwilligung | ✓ | Toast | Honeypot ✓ | `gtag` direkt | getrennte UWG-Einwilligung für den Rückruf ✓ (vorbildlich) |
| Beratungs-Modal (`BeratungModal`) | 2 Pflicht + 3 optional | ✓ (mit *) | — | — | `generate_lead` ✓ | ok |
| `/kfzgutachter-lp` (`LeadFormClient`) | 3 | ✓ | inline ✓ | — | eigenes `trackLpEvent` | dritte Implementierung desselben Formulars |
| **Cluster-LPs `RueckrufPopover`** (5 Domains) | Vorname, Nachname, Telefon | **nur Placeholder, kein `<label>`** | — | — | `dataLayer` ✓ | Placeholder verschwinden beim Tippen; Screenreader ohne Feldnamen (Klasse aus `COORDINATION-adressfelder-ohne-label-verknuepfung`) |
| autounfall.io Finder (`FinderMap`) | Name, Telefon, Ort, E-Mail opt., Schadensart opt. + Einwilligung | ✓ | — | — | Plausible | ok; „Match in 24 Stunden" als Erwartung ✓ |
| Partner-Registrierungen (`app.claimondo.de/{sv,werkstatt,flotte,makler}/registrieren`) | 1 / 15 / 4 / 11 | (App) | (App) | (App) | (App) | Audit B #4: kein „was danach passiert"; Werkstatt 15 Felder |

Querschnitt: **vier Kopien** desselben Drei-Feld-Formulars (`Field`-Komponente in Home, Check, Stadt, LP) mit drei verschiedenen Tracking-Wegen (`trackEvent`, `gtag`, `trackLpEvent`). Die Danke-Seite `/schaden-melden/link-versendet` (56 Wörter) sagt gut, was als Nächstes passiert, bietet aber keinen Weg, wenn der Link nicht ankommt (kein „Link erneut senden"/Telefon) und keinen Zweitschritt (App-Login).

### 9.2 Popups und Overlays (popup-cro)

| Element | Trigger | Frequenz | Schließen | Tracking | Bewertung |
|---|---|---|---|---|---|
| `ScrollPopoverClient` (`/kfzgutachter-lp`) | 20 % Scroll, nur abwärts, nach Arm-Timer | 1× je Session (`sessionStorage`), `?popover_force=1` | ja, je Schritt getrackt | ✓ | sauber; noindex-LP |
| `StickyCallBar` (52 Seiten) | sofort | einklappbar je Session, blendet am Footer aus | ✓ | `generate_lead` (Rückruf) ✓ | Audit A #2: auf `/check` und `/schaden-melden` verdeckt sie das Formular — dort entfernen |
| ProvenExpert `ProSealWidget` | sofort, `position: fixed` | dauerhaft | 20×20 px | — | Audit A #1: mobil `hideOnMobile: true` |
| `ConsentManager` (CMP) | kein Banner (Default `granted`, Opt-out) | — | Footer-Link | — | s. 9.6 |
| `BeratungModal` | Klick | — | ✓ | ✓ | ok |

Kein Exit-Intent, kein E-Mail-Popup, kein Zeit-Trigger — für Unfallgeschädigte richtig. **Keine neuen Popups empfohlen.** Einziger Kandidat: klick-ausgelöst nach dem `/check`-Ergebnis („Ergebnis als PDF an meine E-Mail") — s. 9.3.

### 9.3 Lead-Magnets (lead-magnets)

**Bestand:** Unfallskizze-PDF (ungated, `/downloads/unfallskizze-claimondo-vorlage.pdf`), autounfall.io Unfallbericht-Generator (PDF-Export), vier Rechner (Nutzungsausfall, Wertminderung, SF-Rückstufung, Wiederbeschaffungswert), Kürzungs-Checker, Schadensreport 2026 (Seite), elf Decoder mit Brief-Vorlagen im Fließtext, `/check` (Quiz → Lead), Gewinnspiel (Gutschein → Lead mit UWG-Einwilligung). **Es gibt keine E-Mail-Erfassung, keinen Newsletter, kein gated Asset.** Die Erfassung ist telefon-zentriert (Rückruf) — für den Akutfall richtig; für die 268 Ratgeber-Seiten mit spätem CTA (§5.8) fehlt der Zwischenschritt für Leser, die *noch nicht* anrufen wollen.

Drei Magnets, die aus vorhandenem Material entstehen (Aufwand je 2–8 h):

| Magnet | Phase | Quelle | Gate | Nachbereitung |
|---|---|---|---|---|
| **Ergebnis der Anspruchsprüfung als PDF** („Das steht Ihnen zu" nach `/check`) | Entscheidung | `buildCheckResult` liefert die Liste bereits | E-Mail optional **nach** dem Ergebnis (kein Kopplungsverbot: Ergebnis bleibt sichtbar) | Zustellung = Service-Mail; Reminder nur mit Einwilligung |
| **Widerspruchs-Paket Versicherer-Kürzung** (11 Decoder-Musterbriefe als ein PDF) | Entscheidung | `content/claimondo/decoder/*.md` Abschnitt „Brief-Vorlage" | Content-Upgrade auf jeder Decoder-Seite, E-Mail-Zustellung | Übergabe an `lead-reminders` nur bei gesetztem Haken |
| **Akut-Checkliste 24 Stunden** (PDF) | Akut | autounfall.io `/akutphase-checkliste`, `/erste-12-fotos` | ungated Download + optionaler E-Mail-Versand | Standalone-Marke autounfall.io, kein Claimondo |

Pflicht (dsgvo-email-marketing): PDF auch ohne Newsletter-Häkchen; Werbe-Mails nur nach Double-Opt-In; die Zustell-Mail bleibt werbefrei (BGH VI ZR 134/15).

### 9.4 Tracking (analytics-tracking)

**Stack:** claimondo.de GA4 `G-9YF2W9ZP2S` (gtag direkt, Consent Mode v2, Default `granted`), OAIQ-Pixel (ID seit 04.09. im Workflow), Clarity; Cluster-LPs GTM `GTM-KD2L63T3` → Ads `AW-18202744855`; autounfall.io Plausible + Clarity (kein Google). Server-seitig: `trackServerConversion` (Measurement Protocol) für `generate_lead` (Mini-Wizard) und `sa_signed` (210 €, Value-Based-Bidding-Konzept vom 20.06.).

| Lücke | Wirkung |
|---|---|
| **Kein `form_start`/Feld-Event** auf `/schaden-melden` und der Startseite | Abbruchquote der wichtigsten Formulare nicht messbar; nur Abschluss sichtbar |
| **Kein `cta_click` mit `location`** (nur `phone_click` 2×, `whatsapp_click` 1×) | Frage „Hero-CTA oder Sticky-Leiste?" unbeantwortbar — genau die Frage, die Audit A #2/#4 stellt |
| **Drei Namenswelten:** `generate_lead` (GA4-Standard) neben `lead_created`, `check_pruefen`, `lead_submit`, `trackLpEvent` | kein gemeinsamer Tracking-Plan; jede Auswertung muss erst Events übersetzen |
| **GA4↔Ads-Property-Mismatch** (`docs/dev-feedback-sa-signed-ads-pipeline.md`, 20.06.): `sa_signed` läuft in `G-9YF2W9ZP2S`, Ads ist an `G-3GER9D7KRZ` verknüpft | das 210-€-Signal erreicht das Bidding nicht — Status in Ads prüfen (Aaron) |
| `fbclid`/`ttclid` repo-weit 0 Treffer (nur `gclid`) | Paid-Social-Attribution fehlt (Memory Gewinnspiel) |
| Finder im iframe (`app.claimondo.de/embed/…`) | Events landen in der App-Property; Marketing-Seite sieht nur den Klick |
| Attribution `page_url`/UTM | seit #5476/#5499 gefüllt ✓ (vorher 1 von 44) |

Ein **Tracking-Plan** (Event · Properties · Trigger · Ort) existiert nirgends als Dokument — Task 11 legt ihn an.

### 9.5 A/B-Tests (ab-test-setup)

Keine Experiment-Infrastruktur im Repo (0 Treffer für experiment/variant/posthog/growthbook). Und — wichtiger — **das Volumen trägt keine klassischen Tests**: echte Finder-Anfragen Juli 8, August 3 (Memory `AUDIT-lead-attribution-war-blind`), 13 echte Leads von 78. Ein Test auf „Lead-Conversion" bräuchte bei 3 % Baseline und 20 % erwartetem Uplift ~12.000 Besucher je Variante. Konsequenz:

1. Bekannte Defekte **ohne Test** beheben (Audit A/B/E, §2–§5) — dort ist kein Zweifel, was besser ist.
2. Testen nur auf Mikro-Conversions mit Volumen: `check_start`-Rate, `form_start`-Rate, Klick auf den Hero-CTA — dafür braucht es erst die Events aus 9.4.
3. Erste drei Hypothesen (ICE): **Hero-CTA `/check` statt `/gutachter-finden`** (Impact 8 · Confidence 7 · Ease 8), **KPI-Band belegbar statt 2.000+/8 Mio** (7 · 6 · 9), **Sticky-Leiste ein Element statt drei** (6 · 6 · 9). Infrastruktur: serverseitige Zuweisung per Cookie in der Middleware + `dataLayer.push({experiment, variant})` + GA4-Dimension — kein Drittanbieter nötig (DSGVO).

### 9.6 DSGVO / UWG im Marketing (dsgvo-email-marketing)

| Thema | Befund | Einordnung |
|---|---|---|
| **Cold-Mail an Sachverständige** (`src/lib/cold-mail/*`, Absender `partner@claimondo.de`, KI-komponiert, Empfänger aus `sv_leads` = gescrapte Adressen) | List-Unsubscribe One-Click ✓, Opt-out-Token ✓, Logging ✓ — aber **keine Einwilligung, kein Bestandskunden-Privileg** (kein Kauf) | ⛔ UWG § 7 II Nr. 3 gilt auch B2B; schon eine unverlangte Werbe-Mail an Gewerbetreibende ist Eingriff in den Gewerbebetrieb (BGH I ZR 218/07). Der Skill sieht hierfür ausdrücklich keine „konforme Variante" vor. **Anwalt/DSB vor dem nächsten Versand.** Telefonische B2B-Ansprache (mutmaßliche Einwilligung, § 7 II Nr. 1) ist der rechtlich tragfähigere Kanal — das cannaflow-Setup existiert bereits. Absender-Domain teilt sich die Reputation mit den Transaktionsmails (im Code dokumentiert) |
| Lead-Reminder (3 Stufen) + Win-back („Ihre Schadenmeldung wartet noch auf Sie") | List-Unsubscribe ✓, Abmelde-Link ✓ | Erinnerung an die eigene, abgebrochene Anfrage ist Service; ab der Win-back-Wiederholung kippt es Richtung Werbung — Templates explizit als `transactional`/`marketing` klassifizieren, keine Cross-Sell-Blöcke |
| Werkstatt-Onboarding-Drip, Makler-Wochenreport | Opt-out ✓ | B2B-Bestandskontakt nach Registrierung; Einwilligungstext bei der Registrierung prüfen (App) |
| Gewinnspiel | Rückruf-Einwilligung getrennt, Teilnahme nur mit Einwilligung | Kopplung Gewinnspiel↔Werbeeinwilligung ist in DE zulässig, wenn transparent (BGH I ZR 7/16); Teilnahmebedingungen laut Marker **nicht anwaltlich geprüft** — Launch-Blocker |
| WhatsApp | Statusnachrichten = Service (Einwilligung in `/schaden-melden` ✓); Gewinnspiel-Beratung per WhatsApp in derselben Einwilligung wie Telefon | vertretbar (gleicher Zweck); strenge Lesart will je Kanal ein Häkchen |
| Cookie-Consent Default `granted` (Opt-out, Anwalts-Freigabe 26.06.) | Rechtstext an Technik angepasst (Art. 6 I f + Art. 21) | bleibt ein Restrisiko nach TDDDG § 25 (`_ga` ohne Einwilligung); nicht Gegenstand dieses Audits, nur benannt |
| Tracking-Pixel in Mails | keine im Repo ✓ | Resend-seitiges Open-/Click-Tracking auf Domain-Ebene prüfen (TDDDG § 25) |
| Consent-Nachweis `/api/consent` auf claimondo.de | seit #5499 same-origin ✓ | — |

### 9.7 Was daraus in den Plan geht

Task 11 (Tracking-Plan + Events + Honeypot + eine `LeadForm`-Komponente), Task 12 (Lead-Magnet „Ergebnis als PDF"), Task 13 (Cluster-Formular-Labels), Task 14 (Experiment-Infrastruktur light) — und drei **Entscheidungsvorlagen** ohne Code: Cold-Mail-Kanal (UWG), Gewinnspiel-AGB (Anwalt), GA4↔Ads-Verknüpfung (Ads-Konto).
