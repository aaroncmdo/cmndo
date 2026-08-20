# GEO-Baseline claimondo.de — Messung 18.08.2026

**GEO = Generative Engine Optimization**: Sichtbarkeit in KI-Antwortmaschinen (ChatGPT/OAI-SearchBot,
Perplexity, Google AI Overviews, Claude, Copilot). Anders als bei SEO gibt es dort kein Ranking —
es gibt **Zitiert-werden oder nicht**.

Diese Messung ist die Nullmessung. Sie ist wiederholbar (Rezept unten) und dient als Vergleichspunkt
fuer die naechste Messung.

---

## 0 · Was gemessen wurde — und was nicht

| Saeule | Methode | Belastbarkeit |
|---|---|---|
| **1. Technische Zitierfaehigkeit** | 27 Seiten, rohes HTML mit AI-Bot-User-Agent abgerufen und geparst | **hart** — direkt gemessen |
| **2. Crawler-Zugang** | 7 AI-Bot-User-Agents gegen 3 URLs | **hart** — direkt gemessen |
| **3. Tatsaechliche Sichtbarkeit** | 10 definierte Prompts gegen den Retrieval-Korpus | **Proxy** — siehe Einschraenkung |

**Einschraenkung Saeule 3 (wichtig):** Ahrefs Brand Radar (der Dienst, der echte KI-Antworten
auswertet) ist auf unserem Plan **nicht freigeschaltet** — `Insufficient plan` auf allen
Brand-Radar- und Site-Explorer-Endpunkten, inkl. `site-explorer-ai-responses-count`, Domain Rating
und Traffic-Metriken. Es gibt also **keine** direkte Messung „wie oft zitiert ChatGPT uns".

Ersatzweise gemessen: der **Retrieval-Korpus**. KI-Antwortsysteme mit Websuche (ChatGPT Search,
Perplexity, Google AI Overviews) bauen ihre Antwort aus Suchtreffern. Wer nicht in den Treffern
steht, kann nicht zitiert werden. Kein Treffer = keine Zitation ist damit belastbar; ein Treffer
garantiert die Zitation nicht. Die genutzte Websuche ist zudem US-seitig — lokale deutsche Queries
sind dadurch verzerrt (siehe Gegenprobe in §3).

---

## 1 · Crawler-Zugang — vollstaendig offen ✅

Alle sieben getesteten AI-Crawler erhalten **HTTP 200**, keine WAF- oder Bot-Blockade:

| Bot | Status | Bot | Status |
|---|---|---|---|
| GPTBot | 200 | ClaudeBot | 200 |
| OAI-SearchBot | 200 | Google-Extended | 200 |
| ChatGPT-User | 200 | Bingbot | 200 |
| PerplexityBot | 200 | | |

* `robots.txt`: alle AI-Bots explizit erlaubt, nur `Bytespider` gesperrt. Saubere Trennung der
  Portalbereiche (`/admin/`, `/kunde/`, `/flow/`, `/upload/` …) — korrekt.
* `llms.txt`: **vorhanden, 90 KB / 479 Zeilen.** Ungewoehnlich gut ausgebaut — Positionierung,
  6 USP-Cluster, Zahlen, Gruenderangaben, und ein expliziter Hand-off-Hinweis fuer KI-Assistenten.
* `sitemap.xml`: 346 URLs, `lastmod` aktuell, hreflang fuer 6 Sprachen.
* Antwortzeit: 0,23–0,91 s.

**Bewertung:** Diese Schicht ist nicht der Engpass. Sie ist besser als bei den meisten Wettbewerbern.

---

## 2 · Technische Zitierfaehigkeit — Ø 57,9 / 100

27 Seiten quer durch alle Content-Cluster, gemessen am **rohen HTML** (kein JS-Rendering — die
meisten AI-Crawler rendern kein JavaScript).

### Score-Bausteine (Ø ueber alle Seiten)

| Baustein | Wert | Bewertung |
|---|---|---|
| Schema / JSON-LD | 16,6 / 20 | ✅ stark |
| Extrahierbarkeit | 15,8 / 30 | ⚠ HTML-Groesse |
| Struktur (Answer-first) | 13,9 / 20 | ⚠ solide |
| **Zitierbarkeit (Quellen + Statistik)** | **8,5 / 20** | 🔴 schwach |
| **Aktualitaets-Signal** | **3,0 / 10** | 🔴 schwach |

### Nach Cluster

| Cluster | n | Score | Woerter | Text-Anteil | Statistiken | FAQ-Schema | Datum |
|---|---|---|---|---|---|---|---|
| decoder | 2 | 69,5 | 1.848 | 3,3 % | 2,5 | 2/2 | 2/2 |
| haftpflicht | 3 | 67,3 | 1.762 | 3,0 % | 4,0 | 3/3 | 3/3 |
| versicherer | 2 | 66,0 | 1.373 | 2,5 % | 3,0 | 2/2 | 2/2 |
| wissen | 2 | 60,5 | 846 | 1,8 % | 0,0 | 2/2 | 2/2 |
| hyperlokal | 4 | 59,0 | 1.952 | 2,7 % | 8,3 | 4/4 | **0/4** |
| sachverstaendige | 2 | 58,0 | 1.359 | 2,6 % | 3,0 | 0/2 | 2/2 |
| cornerstone | 5 | **55,0** | **747** | 1,4 % | 0,4 | 4/5 | 2/5 |
| kern | 6 | **47,3** | 1.775 | 2,4 % | 7,7 | 3/6 | **0/6** |

### Was gut ist ✅

* **JSON-LD flaechendeckend**: 27/27 Seiten, **0 Parse-Fehler**, 16 verschiedene Typen
  (`FAQPage`, `HowTo`, `DefinedTerm`, `Dataset`, `LegalService`, `BreadcrumbList`, `Article` …).
  FAQPage auf 20/27 Seiten — das ist der staerkste Einzelhebel fuer Perplexity und den hat ihr.
* **Inhaltliche Tiefe**: Ø 1.550 Woerter, Ø 4,1 Frage-Ueberschriften pro Seite.
* **Meta-Daten**: 0 Seiten ohne Description.
* Die Fach-Cluster (`haftpflicht`, `decoder`, `versicherer`) sind durchgaengig die staerksten Seiten.

### Die fuenf konkreten Befunde 🔴

**B1 — `/gutachter-finden` ist fuer AI-Crawler leer (Score 23/100).**
Die Seite liefert im rohen HTML **31 Woerter**, 0 H2, 0 interne Links, 0 Statistiken. Der komplette
sichtbare Text:

> „Kfz-Gutachter in Ihrer Nähe finden — Karte mit Kfz-Sachverständigen, kostenfrei nach §249 BGB"

Karte und SV-Liste werden clientseitig gerendert. Das ist **bewusst so** (Aaron, 16.06.,
AAR-956): der Marketing-Content darunter erzeugte auf Mobil einen Scroll-Konflikt mit der
touch-fangenden 100dvh-Karte. Die Seite ist ein Vollbild-Werkzeug und ein Ads-Landing, kein
Artikel.

Das Problem ist deshalb nicht die Seite, sondern der **Zeiger** darauf: `llms.txt` empfahl
KI-Assistenten genau diese URL als Default-Hand-off („Bevorzugt zur interaktiven Karte"). Ein
Assistent ohne Tool-Zugriff, der dem Hinweis folgt, findet eine textlose Seite und hat nichts
zu zitieren.

⚠ *Befund praezisiert:* Die urspruengliche Fassung stammte aus den ersten 4.000 Zeichen der
llms.txt. Ab Zeile ~146 steht bereits eine vollstaendige **Agentic-API-/MCP-Sektion** — fuer
Assistenten **mit** Tool-Zugriff war der Weg also nie die URL, sondern das Tool. Betroffen war
nur der Textlink-Fallback.

**Gefixt (Aaron-Entscheidung: Hand-off umbiegen, Seite unangetastet):** Die drei Hand-off-Stellen
nennen jetzt zuerst den Tool-Weg und fallen sonst auf die Stadtseite
`/kfz-gutachter/[stadt-slug]` bzw. die Uebersicht `/kfz-gutachter` zurueck — beide mit
Fliesstext, FAQ-Schema und Weg zur Karte. Die Karten-URL bleibt als Klickziel erhalten.

**B2 — Aktualitaets-Signal fehlt auf 14 von 27 Seiten.**
Betroffen: Startseite, `/faq`, **alle vier Hyperlokal-Seiten**, `/kosten-kfz-gutachten`,
`/unverschuldeter-unfall-rechte`, `/wissen`-Hub, `/wie-es-funktioniert`, `/ueber-uns`. Weder
`dateModified` im JSON-LD noch ein sichtbares „Stand: …". Aktualitaet ist ein dokumentierter
Zitations-Faktor — ChatGPT zitiert Inhalte unter 30 Tagen deutlich haeufiger.

**B3 — Quellenbelege: teilweise vorhanden, eine Luecke.** ⚠ *Befund nach Code-Pruefung
korrigiert — die urspruengliche Fassung war zu breit.*

Die erste Messung zaehlte nur **externe Links im HTML** und meldete daraufhin „nur 5 von 27
Seiten mit Quelle". Tatsaechlich laufen Quellenbelege ueber **zwei** Kanaele, und der zweite
ist fuer AI-Crawler der staerkere: `/haftpflicht/*`, `/decoder/*` und `/sachverstaendige/*`
liefern ihre BGH-Aktenzeichen **seit langem** als JSON-LD `citation`
(`extractCitations(a.body)` in `ContentJsonLd`) — live nachgeprueft, z.B. auf
`/sachverstaendige/bvsk`: `BGH VI ZR 357/13`, `VI ZR 67/06`, `VI ZR 225/13`, `VI ZR 174/24`.

**Echte Luecke waren die 13 Versicherer-Hubs.** Sie bauen ihren `@graph` selbst und waren die
einzigen Content-Seiten ohne `citation` — ausgerechnet dort, wo die Kuerzungs-Streitthemen
liegen und in den Prompts reine Urteilssammlungen (captain-huk.de) die Zitate abraeumen.
**Gefixt.**

Was als kleinerer Punkt bestehen bleibt: Die §-Nennungen im **sichtbaren Text** sind
unverlinkt (Startseite: 19 §-Nennungen, 5 Urteilsverweise); die haeufigsten externen Links
sind Footer-Links (ProvenExpert 26, LinkedIn 26, WhatsApp 21). Das Schema traegt die
Belegkette, der Fliesstext nicht.

**B4 — Text-Anteil Ø 2,5 % (330–460 KB HTML pro Seite).**
Bei 456 KB HTML stehen im Schnitt ~11 KB Text. Der Rest ist RSC-Payload. Crawler mit Byte-Budget
schneiden ab; die Extraktion wird unzuverlaessig. Schlechteste Werte: `/gutachter-finden` 0,1 %,
`/schaden-melden` 0,7 %, `/kosten-kfz-gutachten` 1,1 %.

**B5 — Cornerstones sind duenner als ihre Spokes.**
Die fuenf Cornerstone-Seiten haben Ø **747 Woerter** und **0,4 Statistiken** — die
Haftpflicht-Spokes dagegen 1.762 Woerter. Strategisch verkehrt herum: Die Seiten, die die
Themenautoritaet tragen sollen, sind die schwaechsten im Corpus.

**B6 (klein) — doppelter H1 auf 12 von 27 Seiten.**
Muster: ein `sr-only`-H1 plus ein sichtbarer H1, teils mit **abweichendem Text**
(`/faq`: „Häufige Fragen zum Kfz-Schaden — BGH-belegt" vs. „Häufige Fragen —"). Ein Extraktor kann
den falschen greifen. Kein Blocker, aber unsauber.

---

## 3 · Tatsaechliche Sichtbarkeit — 2 von 10 Prompts

Festes Prompt-Set (fuer die Wiederholung unveraendert lassen):

| # | Prompt | Kategorie | Claimondo im Korpus |
|---|---|---|---|
| 1 | Claimondo Erfahrungen Kfz Gutachter Schadensregulierung | Marke | ✅ **4 von 6 Treffern** |
| 2 | wer zahlt den Kfz Gutachter nach unverschuldetem Unfall | Kategorie | ❌ 0 / 9 |
| 3 | gegnerische Versicherung zahlt nicht was tun Verkehrsunfall | Kategorie | ❌ 0 / 9 |
| 4 | Versicherung schickt eigenen Gutachter muss ich das akzeptieren | Kategorie | ❌ 0 / 7 |
| 5 | Kfz Gutachter Köln finden Termin unverschuldeter Unfall | Lokal | ❌ 0 / 10 |
| 6 | Nutzungsausfall Wertminderung Anspruch berechnen | Kategorie | ❌ 0 / 5 |
| 7 | Kfz Sachverständiger Berlin unverschuldeter Unfall kostenlos | Lokal | ❌ 0 / 9 |
| 8 | HUK Coburg kürzt Gutachterkosten Sachverständigenhonorar | Versicherer | ❌ 0 / 9 |
| 9 | digitale Schadensregulierung Plattform Deutschland Anbieter | Vergleich | ❌ 0 / 8 |
| 10 | 4 Wochen Frist Versicherung Regulierung Prüffrist | Kategorie | ✅ **Position 2 von 6** |

**Baseline-Wert: 2/10 = 20 % Prompt-Abdeckung** (1× Marke, 1× Fach-Longtail).

### Gegenprobe: indexiert oder unsichtbar?

Entscheidend fuer die Handlungsempfehlung. Domainbeschraenkte Suchen zeigen: **die Seiten sind im
Index und inhaltlich exzellent erfasst.** Zurueckgeliefert wurden u. a. `/haftpflicht/nutzungsausfall`,
`/haftpflicht/wiederbeschaffungswert`, `/haftpflicht/anwaltskosten-erstattung`,
`/decoder/kfz-gutachter-kosten-tabelle`, `/schadensreport-2026`, `/versicherer/cosmosdirekt`,
`/sachverstaendige/ihk-bestellung-oebv` — mit korrekten Detailzahlen (27–175 €/Tag Sanden-Danner,
500–2.500 € Wertminderung, BGH VI ZR 235/13, BVSK HB V 2025).

Ebenso geprueft und **in Ordnung**: alle Stichproben liefern HTTP 200, stehen in der Sitemap
(159 Stadtseiten), `canonical` korrekt, `robots: index, follow`.

**Daraus folgt: kein Indexierungsproblem, kein Content-Problem — ein Autoritaets- und
Wettbewerbsproblem.** Die Inhalte sind zitierfaehig aufbereitet, setzen sich im offenen Wettbewerb
aber nicht gegen die etablierten Quellen durch.

*Beobachtung mit Vorbehalt:* Bei drei domainbeschraenkten Suchen mit Koeln-Bezug kam
`/kfz-gutachter/koeln` **nie** zurueck, waehrend Hamburg, Cottbus und Wuppertal erschienen —
obwohl Koeln der Firmensitz ist. Das kann Ranking-Rauschen der US-seitigen Websuche sein. Als
Einzelbefund nicht beweiskraeftig, aber in der naechsten Messung gezielt nachpruefen.

### Wer stattdessen zitiert wird (Zitat-Konkurrenz)

| Typ | Domains | Muster |
|---|---|---|
| Ratgeber-Portale | bussgeldkatalog.org (3×), anwalt.de (2×), juraforum.de | hohe Domain-Autoritaet, breite Abdeckung |
| Themen-Spezialisten | **captain-huk.de (6× allein bei Prompt 8)** | totale Dominanz in einer Nische |
| Kanzleien | ra-kotz.de (2×), ralegal.de, anwalt-zemann.net | Fachautoritaet |
| SV-Bueros | sv-anzer.de, gutachter-raiolo.de, autocrashexpert.de, onlinekfzgutachter.de … | viele kleine, sehr spezifische Seiten |
| Plattformen | unfall-navi.de, claym-plus.de, DAT, DEKRA, 360globalnet | direkte Wettbewerber bei Prompt 9 |

`captain-huk.de` ist das Lehrstueck: eine einzige fokussierte Domain besetzt ein komplettes
Streitthema (Honorarkuerzung) mit Urteilssammlung — und wird deshalb zitiert. Genau die Position,
die die `/versicherer/*`- und `/decoder/*`-Seiten anstreben.

---

## 4 · Einordnung

Der Befund ist **nicht** „das GEO-Setup ist schlecht". Er ist unbequemer:

> Die Vorbereitung ist ueberdurchschnittlich (llms.txt, FAQ-Schema flaechendeckend, 346 Seiten,
> alle Bots offen), die Ausbeute liegt bei 20 % Prompt-Abdeckung — getragen fast nur vom
> Markennamen. Der einzige Nicht-Marken-Treffer (`4-Wochen-Frist`, Position 2) kommt von der Seite
> mit einem der hoechsten GEO-Scores. Das validiert die Richtung: wo die Qualitaet stimmt **und**
> das Thema spitz genug ist, funktioniert es.

Die drei Bausteine mit dem groessten Abstand zum Maximum sind zugleich die drei mit dokumentiert
hoechster Zitationswirkung: **Quellenbelege (8,5/20), Aktualitaet (3/10), Extrahierbarkeit
(15,8/30)**.

---

## 4b · Buchung direkt aus dem Chat — gebaut und live, Engpass ist die Abdeckung

Aaron fragte waehrend der Umsetzung nach der Buchung direkt aus dem Chat. Gemessen statt
gebaut — **es existiert vollstaendig:**

| Baustein | Stand |
|---|---|
| MCP-Server `https://mcp.claimondo.de/mcp` | **live** — `initialize` + `tools/list` antworten, `claimondo-mcp-server v1.0.0` |
| Tools | **7** (llms.txt nannte 6 — `claimondo_fall_status` fehlte, im selben PR korrigiert) |
| Buchung | `claimondo_melde_schaden` mit `sv_id` + `slot_start` + `slot_end` → echte Reservierung via `bucheTerminFlow` |
| REST-API `/api/v1/*` | **live** (200), inkl. `openapi.json` — als ChatGPT-Action importierbar |
| llms.txt | hat die Agentic-Sektion bereits: „Ziel jeder Beratung: … einen Termin reservieren" |

Ein roher `GET` auf den MCP-Endpunkt liefert 405 — das ist korrekt, er spricht nur POST/JSON-RPC.

**Der Engpass liegt woanders.** Gemessen ueber `GET /api/v1/gutachter-termine?plz=…`:

| Stadt | buchbare Gutachter | freie Slots |
|---|---|---|
| Köln | 2 | 3 |
| Wuppertal | 2 | 3 |
| Düsseldorf | 1 | 3 |
| **Dortmund, Bonn, Essen** | **0** | **0** |
| **Berlin, Hamburg, München, Stuttgart, Frankfurt, Leipzig** | **0** | **0** |

**3 von 12 Grossstaedten liefern ueberhaupt etwas** — alle im Rheinland, selbst Dortmund, Bonn
und Essen (NRW) sind leer. Ein KI-Assistent kann dort korrekt beraten, aber **nichts anbieten**;
er landet zwangslaeufig beim Rueckruf-Fallback. Das deckt sich mit dem Hyperlokal-Befund
(„nur 42 von 158 Stadtseiten haben einen SV im Einzugsgebiet").

> Weitere Technik an der Chat-Buchung aendert daran nichts — die Kette funktioniert dort, wo
> ein Gutachter im Einzugsgebiet sitzt. Das ist ein Akquise-Thema, kein Entwicklungs-Thema.

---

## 5 · Messung wiederholen

```bash
# Technische Baseline (Saeule 1+2) — ca. 30 s
node scripts/geo-baseline.mjs --out scripts/.geo-baseline-<YYYY-MM-DD>.json
node scripts/geo-baseline.mjs --all --out …          # alle 346 Sitemap-URLs, langsam
node scripts/geo-baseline.mjs --properties --out …   # Sweep ueber ALLE 11 Properties

# Crawler-Zugang
curl -s -o /dev/null -w "%{http_code}" -A "GPTBot/1.2" https://claimondo.de/
```

* Messskript: `scripts/geo-baseline.mjs` (misst rohes HTML mit AI-Bot-User-Agent, kein JS)
* ⚠ **`--properties` misst je Property nur die STARTSEITE.** Deren „ohne dateModified /
  ohne FAQPage" ist ein **Prüfauftrag, kein Befund** — beides sitzt typischerweise auf den
  Unterseiten. Beim ersten Lauf meldete der Sweep `claimondo.de: kein dateModified`, obwohl
  22 von 27 Seiten eines tragen und B2 auf prod verifiziert ist; ebenso `autounfall.io:
  kein FAQPage`, obwohl alle 254 Ratgeber-Seiten eines haben. Das Skript gibt diese Warnung
  bei jedem Lauf aus.
* Rohdaten dieser Messung: `scripts/.geo-baseline-2026-08-18.json`
* Saeule 3: die **10 Prompts aus §3 unveraendert** durch eine Websuche geben und zaehlen, bei wie
  vielen `claimondo.de` in den Treffern steht. Set nicht aendern, sonst ist der Vergleich wertlos.

**Vergleichswerte fuer die naechste Messung:**

| Kennzahl | 18.08.2026 |
|---|---|
| Ø GEO-Score (27 Seiten) | **57,9 / 100** |
| Prompt-Abdeckung | **2 / 10** |
| Seiten mit Aktualitaets-Signal | 13 / 27 |
| Seiten mit Autoritaets-Quelle | 10 / 27 (davon nur 5 Gesetzesquelle) |
| Ø Text-Anteil im HTML | 2,5 % |
| Seiten mit FAQPage-Schema | 20 / 27 |
| AI-Crawler mit Zugang | 7 / 7 |

---

## 6 · Was umgesetzt wurde (Branch `kitta/geo-baseline-fixes`)

Vorher/Nachher mit **demselben** Instrument gemessen (prod = ohne Fixes, lokaler Build = mit),
damit die Skript-Korrektur den Vergleich nicht verfaelscht:

| Kennzahl | prod (vorher) | Build (nachher) |
|---|---|---|
| Ø GEO-Score (27 Seiten) | 59,2 | **61,9** |
| Seiten mit Aktualitaets-Signal | 13 | **22** |
| Seiten mit Quelle (beide Kanaele) | 15 | 15 |
| davon via JSON-LD `citation` | 11 | **13** |

Der Score-Zuwachs wirkt klein, weil im 27er-Sample nur **4 der ~160 Stadtseiten** stecken —
die profitieren alle vom Datums-Fix. Am Server-Response verifiziert (nicht nur „Build gruen"):

* `/faq` → `"dateModified":"2026-07-18"` (vorher: keins)
* `/kfz-gutachter/koeln` → `"dateModified":"2026-05-25"` (vorher: keins, gilt fuer alle Stadtseiten)
* `/versicherer/allianz` → `"citation":[§ 287 ZPO, § 286 BGB]` (vorher: keins)
* `sitemap.xml` → echte gestaffelte `lastmod` (vorher: fuer ~40 Routen bei jedem Build „jetzt")

**Geaenderte Dateien:** `lib/seo/freshness.ts` (neu, gepflegte Route-Freshness aus `git log`),
`lib/seo/jsonld.ts` (`faqPageSchema` um `dateModified`/`url`, rueckwaerts-kompatibel),
25 Seiten + `[stadt]/page.tsx`, `versicherer/[slug]/page.tsx` (citation), `app/sitemap.ts`,
`app/llms.txt/route.ts` (Hand-off + Tool-Liste).

**Nicht umgesetzt — bewusst:**
* **B6 (doppelte H1)** — Ursache: alle 105 Content-Markdown-Dateien beginnen mit `# Titel`,
  zusaetzlich zum Hero-H1. Beide tragen **denselben** Text. Ein Fix beruehrt 105 Seiten
  Rendering (TOC-Anker haengen daran) bei marginalem GEO-Nutzen. Eigenstaendige
  Design-Entscheidung, kein GEO-Blocker.
* ~~**B4 (Text-Anteil 2,5 %)**~~ — **nachgezogen, siehe §8.**
* **B5 (duenne Cornerstones)** — Redaktionsarbeit, kein Code.

## 7 · Offene Punkte

* **Ahrefs Brand Radar ist nicht freigeschaltet.** Solange das so bleibt, gibt es keine direkte
  Messung der KI-Zitationen — nur den Retrieval-Proxy. Ein Plan-Upgrade wuerde
  `site-explorer-ai-responses-count` (Zitate je Plattform: ChatGPT, Perplexity, Gemini, Copilot,
  Google AI Overviews, Grok) und Share-of-Voice gegen Wettbewerber freischalten. Das ist die
  einzige Loesung, die aus dem Proxy eine echte Messung macht.
* **Diese Messung enthaelt bewusst keine Massnahmen** — sie ist die Nullmessung. Die Befunde B1–B6
  sind priorisierbar, sobald gewuenscht.

---

## 8 · B4 nachgezogen — 46 % des HTML waren ungenutzte Übersetzungen

Der Befund B4 („Text-Anteil 2,5 %") war zunächst als „architektonisch, nicht nebenbei zu
machen" zurückgestellt. Eine Analyse der HTML-Zusammensetzung zeigte eine konkrete,
behebbare Ursache. Gemessen auf `/kfz-gutachter/koeln`:

| Bestandteil | Größe | Anteil |
|---|---|---|
| HTML gesamt | 615 KB | 100 % |
| `<script>` gesamt | 482 KB | 78 % |
| davon RSC-Flight-Payload | 466 KB | 76 % |
| **davon i18n-Messages** | **280 KB** | **46 %** |
| sichtbarer Text | 24 KB | 3,9 % |

Der `NextIntlClientProvider` bekam `messages={messages}` — **alle 51 Namespaces** (265 KB),
serialisiert in das HTML **jeder** Seite. Darunter `flow` (14,8 KB), `upload` (6,8 KB) und
`page_meta` (18,3 KB), die eine Stadtseite nie anfasst.

**Server-Komponenten brauchen den Provider gar nicht** — sie übersetzen mit
`getTranslations()` direkt auf dem Server. Nur `useTranslations()` in `'use client'`
benötigt die Messages im Browser. Gemessen über alle 76 Client-Dateien: **12 Namespaces**
(72 KB statt 265 KB). Keine dynamischen Aufrufe, kein `useMessages()`, nur ein Provider —
die Whitelist ist damit vollständig belegbar, nicht geraten.

**Umgesetzt:** `i18n/client-namespaces.ts` (Whitelist + `pickClientMessages`), Filter im
`[locale]/layout.tsx`.

**Abgesichert:** `i18n/client-namespaces.test.ts` scannt alle Client-Dateien und schlägt
fehl, sobald ein genutzter Namespace in der Liste fehlt — läuft in CI (Job `build` →
„Marketing-Unit-Tests"), ohne Ratchet, rot blockt sofort. Der Guard wurde **gegengeprüft**:
mit entferntem `faq` wird er rot und benennt die Datei (`app/[locale]/faq/FaqClient.tsx`).
Ein dritter Test hält die Liste klein (meldet Namespaces, die niemand nutzt), ein vierter
ist die Positiv-Kontrolle gegen einen toten Scanner.

Nötig ist der Guard, weil der Fehlerfall sonst still wäre: Fehlt ein Namespace, zeigt die
UI zur Laufzeit den **rohen Key** — kein Build- und kein `tsc`-Fehler.

### Ergebnis, gemessen über 15 Seiten

| Kennzahl | vorher (prod) | nachher (Build) | Δ |
|---|---|---|---|
| HTML gesamt | 7.594 KB | **4.496 KB** | **−41 %** |
| sichtbarer Text | 226,6 KB | 226,5 KB | **unverändert** |
| Text-Anteil | 3,0 % | **5,0 %** | +67 % |
| rohe i18n-Keys | 0 | **0** | ✓ |

**Der Text ist identisch** — entfernt wurde ausschließlich Ballast, kein Inhalt. Einzelne
Seiten: `/faq` 467 → 261 KB (−44 %), `/haftpflicht/4-wochen-frist` 454 → 248 KB (−45 %),
`/kfz-gutachter/koeln` 615 → 409 KB (−33 %).

Die Vorher-Werte stammen von prod (ohne die Fixes aus §6), die Nachher-Werte vom lokalen
Build (mit). Da §6 JSON-LD *hinzufügt*, ist der ausgewiesene Vorteil eher zu klein als zu
groß.

Der Detektor auf rohe Keys prüft den sichtbaren Text gegen alle 51 echten Namespace-Namen
(präziser als eine Punkt-Heuristik, die auch Domains träfe) und lief auf beiden Ständen
sauber — auf prod als Positiv-Kontrolle, dass er keine Fehlalarme wirft.

### Wo der Payload danach steht

`/kfz-gutachter/koeln`, erneut zerlegt: **409 KB** (vorher 615 KB). Der Flight-Payload fiel
von 466 auf 260 KB, der Messages-Block darin von 280 auf **75,7 KB** — exakt die 12
benötigten Namespaces. Der Rest ist funktional notwendige RSC-Serialisierung der
Komponenten; ein zweiter Hebel dieser Größenordnung ist dort **nicht** mehr erkennbar.

Weiter ginge nur noch eine Filterung **pro Route** statt global. Das Layout kennt die Route
aber nicht ohne `headers()` — was Static Rendering für 346 Seiten kosten würde. Für
geschätzte 40 KB ist das ein schlechtes Geschäft; bewusst nicht gemacht.

---

## 9 · Stand nach allen Fixes (dieselben 27 Seiten, dasselbe Instrument)

| Kennzahl | Ausgangsmessung | nach B1–B4 |
|---|---|---|
| **Ø GEO-Score** | 59,2 / 100 | **67,7 / 100** |
| Ø Text-Anteil im HTML | 2,5 % | **4,5 %** |
| Ø HTML pro Seite | 456,6 KB | **250,3 KB** |
| Seiten mit Aktualitäts-Signal | 13 / 27 | **22 / 27** |
| Seiten mit Quelle | 15 / 27 | 15 / 27 |
| FAQPage-Schema | 20 / 27 | 20 / 27 |
| JSON-LD-Parse-Fehler | 0 | 0 |

**Was das nicht ist:** eine Aussage über die Sichtbarkeit. Die Prompt-Abdeckung (2/10)
hängt an Autorität und Wettbewerb, nicht an der Seitentechnik — sie wird sich erst über
Wochen bewegen und ist beim nächsten Durchlauf des Prompt-Sets aus §3 zu messen.

**Offen aus der Baseline:** B5 — siehe §10. B6 (doppelte H1) — bewusst zurückgestellt, §6.

---

## 10 · B5 nachgeschärft: nicht „zu wenig geschrieben", sondern **aufgeteilt**

B5 lautete „Cornerstones sind dünner als ihre Spokes". Die Nachprüfung am gerenderten HTML
bestätigt die Zahlen — und zeigt, dass es **kein Rendering-Problem** ist (Absätze, Listen und
H2 sind vorhanden, es ist real weniger Inhalt):

| Seite | Wörter | H2 | Absätze |
|---|---|---|---|
| `/haftpflicht/4-wochen-frist` (Spoke) | **1.839** | 15 | 41 |
| `/unfall-was-tun-als-geschaedigter` (Cornerstone) | 1.032 | 8 | 49 |
| `/gegnerische-versicherung-zahlt-nicht` | 620 | 6 | 20 |
| `/unverschuldeter-unfall-rechte` | 541 | 5 | 24 |
| `/kosten-kfz-gutachten` | 540 | 5 | **8** |

Ein einzelner Spoke trägt das 3,4-fache seiner Cornerstone. Strategisch ist das verkehrt
herum: Die Cornerstone soll die Themenautorität bündeln und auf die Spokes verteilen.

### Der eigentliche Befund: zwei Seiten beantworten dieselbe Frage

| URL | `<title>` | Wörter |
|---|---|---|
| `/kosten-kfz-gutachten` | „Was kostet ein Kfz-**Gutachten**? Für Geschädigte 0 €" | 540 |
| `/kfz-gutachter/kosten` | „Was kostet ein Kfz-**Gutachter**? — 0 € bei Fremdverschulden (§ 249 BGB)" | 841 |

Für einen Nutzer — und für ein Antwortsystem — ist das **dieselbe Frage**. Zwei URLs
konkurrieren darum, beide mittelmäßig ausgestattet; keine gewinnt klar. Das erklärt B5
besser als „zu wenig geschrieben": die Substanz ist auf zwei Seiten **verteilt**.

(Nicht betroffen: `/decoder/kfz-gutachter-kosten-tabelle` — die BVSK-Tabelle ist ein eigenes
Format mit eigenem Zweck und war in der Messung die stärkste Seite überhaupt, 71/100.)

### Empfehlung

**Zusammenführen statt beides ausbauen.** Eine Seite trägt die Frage „Was kostet das?"
vollständig (Honorarspannen, wer zahlt, § 249, Kürzungsfälle, Verweis auf die BVSK-Tabelle),
die andere wird darauf umgeleitet. Das verdoppelt die Substanz der bleibenden Seite, ohne
dass eine Zeile neu erfunden werden muss — der Stoff existiert bereits, nur eben zweigeteilt.

⚠ Das ist eine **Redaktions- und SEO-Entscheidung**, keine technische: Welche URL bleibt,
hängt an Rankings und Backlinks, die außerhalb dieser Messung liegen. Vor dem Umbau mit der
SEO-Lane abstimmen — dort läuft parallel ein Audit der Marketing-Seiten.

---

## 11 · Blinder Fleck der Baseline: die sechs weiteren Properties

Die Messung galt ausschließlich `claimondo.de`. Im Repo liegen aber **sechs eigenständige
Top-Level-Builds** mit je eigener `robots.ts`, `sitemap.ts` und `llms.txt` — sie wurden nie
gemessen. Nachgeholt am 18.08.2026:

| Property | Start | robots | llms.txt | sitemap | HTML | Text-Anteil |
|---|---|---|---|---|---|---|
| autounfall.io | 200 | 200 | 200 | 200 | 49 KB | 5,7 % |
| kfz-unfallgutachter-aachen.de | 200 | 200 | 200 | 200 | 316 KB | **8,0 %** |
| kfz-unfallgutachter-bonn.de | 200 | 200 | 200 | 200 | 305 KB | 6,8 % |
| kfz-unfallgutachter-duesseldorf.de | 200 | 200 | 200 | 200 | 305 KB | 6,8 % |
| kfz-unfallgutachter-koeln.de | 200 | 200 | 200 | 200 | 317 KB | **8,0 %** |
| kfz-unfallgutachter-wuppertal.de | 200 | 200 | 200 | 200 | 307 KB | 6,7 % |

**Alle sechs sind live und technisch besser aufgestellt als die Hauptdomain** — der
Text-Anteil liegt bei 6,7–8,0 % gegenüber 4,4 % auf `claimondo.de` nach allen Fixes. Das
Schema ist solide: 5 JSON-LD-Blöcke je Cluster-Seite (`AutomotiveBusiness`, `FAQPage`,
`AggregateRating`, `GeoCoordinates`, `OpeningHoursSpecification`).

### Befund 1 — kein Aktualitäts-Signal (B2 gilt hier genauso)

**Keine der sechs Properties setzt `dateModified`.** Das ist derselbe Befund, der auf
`claimondo.de` als B2 behoben wurde. Der Fix wäre analog (`dateModified` in `faqSchema()`,
`lib/schema.ts`) — vier der fünf Cluster-`schema.ts` sind byte-identisch, Aachen weicht ab.

Bewusst **nicht** blind umgesetzt: Jede Property ist ein eigener Next-Build mit eigenem
Deploy, das wären fünf Build-/Verifikationszyklen. Und die Frage darunter wiegt schwerer:

### Befund 2 🔴 — zwei Cluster-Domains ohne buchbaren Gutachter

Gemessen über `GET /api/v1/gutachter-termine` — also über genau den Weg, den ein Besucher
dieser Domains nimmt:

| Cluster-Domain für | PLZ | buchbare Gutachter | freie Slots |
|---|---|---|---|
| **Aachen** | 52062 | **0** | **0** |
| **Bonn** | 53111 | **0** | **0** |
| Düsseldorf | 40213 | 1 | 3 |
| Köln | 50670 | 2 | 3 |
| Wuppertal | 42103 | 2 | 3 |

Für Aachen und Bonn existiert je eine **eigene Domain mit eigenem Deployment und eigener
SEO-Arbeit** — für Städte, in denen aktuell kein Termin vergeben werden kann. Wer dort
ankommt und bucht, landet zwangsläufig im Rückruf-Fallback.

*Einschränkung:* Gemessen sind **buchbare Slots**, nicht bloße SV-Präsenz — ein
Sachverständiger ohne freie Termine erscheint hier ebenfalls als 0. Die Richtung deckt sich
aber mit der unabhängigen Erhebung, nach der Bonn zu den 101 unabgedeckten Städten zählt.

**Empfehlung:** Diese beiden Domains sind der schärfste Beleg dafür, dass SV-Akquise vor
weiterer Reichweitenarbeit kommt. Ein `dateModified`-Fix auf einer Domain ohne Gutachter
verbessert die Zitierfähigkeit einer Antwort, die keinen Termin anbieten kann.

---

## 12 · Der Weg für ChatGPT **ohne** installierte App — Deep-Link statt Sackgasse

§4b hat gezeigt: Die Buchung aus dem Chat existiert vollständig — **für Clients mit
Tool-Zugriff** (MCP-Connector oder importierte ChatGPT-Action). Das ist die Minderheit.
Der normale ChatGPT-Nutzer ohne App liest die öffentliche API bestenfalls indirekt und
bekommt am Ende einen Link. Genau dort war die Kette gebrochen.

**Gemessen am 20.08. auf prod, vor der Änderung:**

```
GET /api/v1/gutachter-termine?plz=50670
  anzahl_gutachter:      2
  Felder je Gutachter:   id, vorname, profilbild, bewertung_*, entfernung,
                         ist_top_partner, wunschtermin_frei, termine
  interaktive_karte_url: https://claimondo.de/gutachter-finden?plz=50670
```

Die Antwort nennt einen konkreten Gutachter mit konkreten Slots — und verlinkt dann auf die
**allgemeine Karte ohne jede Auswahl**. Wer im Chat „Gutachter X hat Donnerstag frei" liest
und klickt, steht wieder am Anfang der Suche. Die Empfehlung, die die KI gerade gegeben hat,
geht im Klick verloren.

**Gebaut (PR `kitta/geo-deeplink-sv-vorauswahl`)** — fünf Schichten, eine davon war dank
`Omit<…>` im Wrapper gratis:

| Schicht | Änderung |
|---|---|
| `api/v1/gutachter-termine` | **`gutachter[].buchungs_url`** — fertiger Link je Gutachter |
| `api/v1/openapi.json` | Feld im Schema + `required` — sonst filtern ChatGPT-Actions es weg |
| `llms.txt` | Anweisung: *diesen* Link ausgeben, **nicht** `interaktive_karte_url` |
| Marketing `/gutachter-finden` → `EmbedFinderSection` | `?sv=` bis in die iframe-URL |
| `FinderWizard` | `waehleVorauswahl()` ersetzt `svs[0]` an allen drei Matching-Stellen |

**Zwei bewusste Verengungen**, beide im Code begründet:

* **Kein Slot im Link.** Zwischen KI-Antwort und Klick vergehen Minuten; der Slot kann weg
  sein. Eine Vorauswahl, die ins Leere zeigt, ist schlechter als keine. Der Gutachter ist
  die Information aus dem Chat, die erhalten bleiben muss — der Slot ist ein Klick.
* **Kein schreibender GET.** Ein Endpunkt, der per Link einen Termin bucht, würde von jedem
  Crawler ausgelöst. Der Kunde bestätigt weiterhin selbst.

**Robust nach beiden Seiten:** Ist der SV beim Klick belegt oder unbekannt, fällt die
Vorauswahl still auf den bestgerankten zurück — gültige Liste statt Fehlerseite. Und schon
vor dem Deploy gemessen: `?sv=<unbekannte-uuid>` liefert HTTP **200**, ein unbekannter
Parameter wird ignoriert.

**Offen:** Der MCP-Server (`mcp.claimondo.de`) liegt **nicht in diesem Repo** — ob
`buchungs_url` dort ankommt, hängt daran, ob er die API-Antwort durchreicht oder die Felder
selbst mappt. Ungeprüft. Dazu der Regel-4-Prod-Smoke nach dem Deploy.

> Die Einschränkung aus §4b bleibt unberührt: Der Deep-Link verbessert den Weg dorthin, wo
> ein Gutachter sitzt. In den 9 von 12 Großstädten ohne buchbaren SV ändert er nichts.

---

*Messung: 18.08.2026, 14:51 UTC · Seiten-Sample: 27 · User-Agent: OAI-SearchBot/1.0 ·
Skript: `scripts/geo-baseline.mjs` · §12 ergänzt 21.08.2026*
