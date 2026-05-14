# Indexierungs- und GEO-Setup — Anleitung für Aaron

**Stand:** 14.05.2026
**Kontext:** Marketing-Premium-Rework auf claimondo.de ist live (15+ PRs gemerged).
Technische Indexierungs-Voraussetzungen sind erfüllt. Was jetzt fehlt, sind die
**Account-/Verzeichnis-Eintragungen**, die nur du machen kannst.

---

## 0 · TL;DR

| Bereich | Status | Verantwortlich |
|---|---|---|
| robots.txt mit AI-Crawler-Allow (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, …) | ✅ live | Code (erledigt) |
| sitemap.xml mit 90 URLs (alle Premium-Pages + 73 Städte) | ✅ live | Code (erledigt) |
| Per-Page Title + Description + Canonical + Open-Graph + JSON-LD + H1 | ✅ alle 11 Pages | Code (erledigt) |
| /llms.txt + /llms-full.txt für AI-Discovery | ✅ live | Code (erledigt) |
| Schema.org: Organization + LegalService + Service + HowTo + FAQPage + BreadcrumbList + Article + Dataset | ✅ live | Code (erledigt) |
| **Google Search Console: Sitemap einreichen** | ⚠ offen | **Aaron** |
| **Bing Webmaster Tools: Sitemap einreichen** | ⚠ offen | **Aaron** |
| **Wikidata-Eintrag für Claimondo** | ⚠ offen | **Aaron** |
| **NAP-Verzeichnisse (BVSK, DAT, Anwalt.de, Provenexpert)** | ⚠ offen | **Marketing** |
| **Schadensreport 2026 mit eigenen Daten füllen** | ⚠ offen (TODO im Code) | **Aaron + Daten-Team** |

→ Ohne die ⚠-Punkte hängt die Page in der Indexierungs-Warteschlange.
Mit Aktion 1 + 2 (GSC + Bing) ist sie binnen 48–72 h crawled.

---

## 1 · Google Search Console — Sitemap einreichen (kritisch, ~15 Min)

### 1.1 Property einrichten

1. Öffne https://search.google.com/search-console/
2. Login mit dem Google-Account, der `claimondo.de` verwaltet
3. „Property hinzufügen" → **Domain-Property** (nicht URL-Präfix)
4. Domain eingeben: `claimondo.de`
5. **Verifizierung per DNS-TXT-Record:**
   - Google zeigt dir einen TXT-Record wie `google-site-verification=xyz...`
   - Bei IONOS (DNS-Provider, siehe Memory `project_vps_ip_dns`) einloggen
   - DNS-Verwaltung für `claimondo.de` → neuen TXT-Record anlegen
   - Host: `@` (oder leer), Wert: `google-site-verification=xyz...`
   - TTL: 3600
6. Zurück zu GSC → „Verifizieren" — kann 5–60 Min dauern bis DNS propagiert

### 1.2 Sitemap einreichen

Sobald verifiziert:

1. Linke Sidebar → **Sitemaps**
2. URL eingeben: `sitemap.xml` (GSC ergänzt die Domain selbst)
3. „Senden" klicken
4. Status nach 1–24 h prüfen — sollte „Erfolgreich" mit **90 URLs** zeigen

### 1.3 URL-Inspection für kritische Pages

Beschleunigt Crawl für die Top-10-Pages. Im Inspection-Tool (oben) eingeben + „Request Indexing":

```
https://claimondo.de/
https://claimondo.de/vorteile
https://claimondo.de/wie-es-funktioniert
https://claimondo.de/faq
https://claimondo.de/ueber-uns
https://claimondo.de/schadensreport-2026
https://claimondo.de/ersteinschaetzung
https://claimondo.de/gutachter-finden
https://claimondo.de/kfz-gutachter
https://claimondo.de/kfz-gutachter/koeln
```

Für die 71 anderen Stadt-Pages sammelt Google sie automatisch über die Sitemap — kein manueller Re-Index nötig, dauert aber 1–4 Wochen.

### 1.4 Was du in GSC danach täglich checkst

| Bericht | Wo | Wonach schauen |
|---|---|---|
| **Coverage** (Abdeckung) | Indexierung → Seiten | „Gültig" vs „Mit Warnungen" vs „Ausgeschlossen" — Ziel: 90/90 gültig binnen 4 Wochen |
| **Sitemaps** | Indexierung → Sitemaps | „Gefundene URLs" vs „Indizierte URLs" |
| **Suchergebnisse** | Leistung → Suchergebnisse | Klicks/Impressionen/CTR/Position pro Suchanfrage |
| **Mobile Usability** | Erfahrung → Core Web Vitals | LCP, INP, CLS — sollten alle grün sein |

---

## 2 · Bing Webmaster Tools (~10 Min, weniger Traffic aber GPT-relevant)

ChatGPT-Suche und Copilot nutzen die **Bing-Index** als Grundlage. Indexierung dort
ist daher direkt GEO-relevant, nicht nur klassisches Suchvolumen.

### Setup

1. https://www.bing.com/webmasters/
2. Login mit Microsoft-Account
3. „Site hinzufügen" → `https://claimondo.de`
4. Verifizierung:
   - Option A (empfohlen): GSC-Import — wenn Google bereits verifiziert ist, picked Bing das automatisch
   - Option B: Meta-Tag in `src/app/layout.tsx` einfügen (sag mir Bescheid, dann mache ich's)
   - Option C: DNS-TXT-Record (analog Google)
5. „Sitemaps" → `https://claimondo.de/sitemap.xml` einreichen
6. „URL Submission Tool" für die Top-10-URLs (siehe 1.3) — Bing erlaubt 10.000 URLs/Tag

### Bing-spezifisch

- **IndexNow** (https://www.indexnow.org/) — Bing-getriebenes API für Sofort-Push neuer/geänderter URLs. Yandex und Seznam beteiligen sich auch. Setup über Code möglich (sag Bescheid wenn gewünscht).

---

## 3 · AI-Crawler / GEO-Off-Page (mehrere Tage Verteilung, Aaron-Aufgaben)

Die folgenden Schritte sind **nicht technisch im Code lösbar** — sie brauchen
externe Konto-Eintragungen + Content-Veröffentlichungen. Aber sie sind der GEO-Hebel
für AI-Antworten in ChatGPT / Claude / Perplexity / Gemini.

### 3.1 Wikidata-Eintrag (1 h einmalig, dann passiv)

**Warum:** AI-Assistenten nutzen Wikidata als Knowledge-Graph-Quelle. Ein
verifizierter Wikidata-Eintrag mit korrekter Entitäts-Beschreibung ist der
schnellste Weg, „Was ist Claimondo?" zu beantworten.

**Schritte:**

1. https://www.wikidata.org/ → Account anlegen (oder bestehend nutzen)
2. „Create a new item" → Label: `Claimondo`
3. Description (DE): „Digitale Plattform für Kfz-Schadensregulierung mit Sitz in Köln"
4. Description (EN): „Digital platform for car damage claims based in Cologne"
5. Statements ergänzen:
   - `instance of` → Q4830453 (business)
   - `country` → Q183 (Germany)
   - `headquarters location` → Q365 (Cologne)
   - `inception` → 2025
   - `founder` → Nicolas Kitta + Aaron Sprafke (eigene Items anlegen falls noch nicht da)
   - `official website` → https://claimondo.de
   - `industry` → automotive claims management
6. Nach 24–72 h: Q-ID notieren (z. B. `Q123456789`)
7. **Mir die Q-ID schicken** → ich setze sie in `organizationSchema.sameAs` ein
   (TODO-Marker ist bereits im Code: `src/lib/seo/jsonld.ts` Zeile ~114)

### 3.2 Branchen-Verzeichnisse mit NAP-Konsistenz (~2–4 h)

**Wichtig:** alle Verzeichnisse müssen **exakt** dieselben NAP-Daten haben:

```
Name:    Claimondo
Adresse: Hansaring 10, 50670 Köln
Phone:   0221 25906530
Email:   kontakt@claimondo.de
Website: https://claimondo.de
```

| Verzeichnis | URL | Zweck |
|---|---|---|
| BVSK-Verzeichnis | https://www.bvsk.de/ | Bundesverband freier Sachverständiger — höchste Branchen-Autorität |
| DAT-Sachverständigen-Liste | https://www.dat.de/sachverstaendige/ | DAT als Marktführer für Kfz-Bewertung |
| Anwalt.de | https://www.anwalt.de/ | Branchen-Standard für Kanzlei-Verzeichnis (für LexDrive-Partnerschaft) |
| Provenexpert | https://www.provenexpert.com/ | Bewertungs-Aggregator, zieht Google-Reviews ein |
| Yelp | https://www.yelp.de/ | Lokal-SEO + Yelp-Crawler-Coverage |
| Gelbe Seiten | https://www.gelbeseiten.de/ | Google sieht Konsistenz mit DE-Lokal-Verzeichnis |
| TÜV-Süd Verzeichnis | tuvsud.com/de | Backlink + Autorität |

→ Pro Verzeichnis: Account anlegen, NAP einsetzen, ein Profilbild + Beschreibung
(„2025 in Köln gegründete digitale Plattform für die vollständige Regulierung von
Kfz-Haftpflichtschäden …" — Volltext im `/ueber-uns` kopierbar).

### 3.3 Google Business Profile (~30 Min einmalig)

**Warum:** Google Maps + Local-Pack-Ranking + AggregateRating-Schema-Verknüpfung
(wir können die Reviews dann technisch sauber in JSON-LD einspielen).

1. https://www.google.com/business/
2. „Profil hinzufügen" → Claimondo
3. Kategorie: **Kfz-Sachverständiger** (Hauptkategorie) + **Rechtsdienstleistung**
4. NAP exakt wie oben
5. Öffnungszeiten: Mo–Fr 08:00–20:00, Sa+So 09:00–18:00
6. Verifizierung per Postkarte (oder Telefon, falls verfügbar)
7. Sobald live: Place-ID notieren, mir schicken — ich nutze sie für `LegalService.geo` + `aggregateRating`-Schema-Schicht

### 3.4 LinkedIn Company Page (~15 Min einmalig)

1. https://www.linkedin.com/company/setup/new/
2. Branche, NAP, Logo
3. Sobald aktiv: URL prüfen — wir haben in `organizationSchema.sameAs` schon
   `https://www.linkedin.com/company/claimondo` eingetragen. Falls die URL anders
   ist (z. B. `/company/claimondo-gmbh`), mir Bescheid sagen → ich korrigiere.

### 3.5 YouTube-Channel + Erste 8 BGH-Az-Videos (Wochen)

**Warum:** AI-Assistenten zitieren oft YouTube-Transkripte. Jedes BGH-Az-Video
(60–90 Sek, einfach erklärt) erzeugt eine zitierbare Mini-Quelle.

Themen (alle bereits in unserem Content):
1. BGH VI ZR 38/22 ff. — Werkstattrisiko 2024
2. BGH VI ZR 65/18 — UPE-Aufschläge
3. BGH VI ZR 174/24 — Beilackierung 2025
4. BGH VI ZR 53/09 — Markenwerkstatt-Sätze
5. BGH VI ZR 119/04 — Restwert regional
6. BGH VI ZR 357/03 — Wertminderung
7. BGH VI ZR 67/91 — 130%-Regel
8. BGH VI ZR 280/22 — SV-Honorar-Risiko

Script-Vorlagen kann ich auf Wunsch aus `/faq` + `/schadensreport-2026` generieren.

### 3.6 Reddit + Quora-Antworten-Sprint (mehrere Tage)

Auf Fragen wie „Wer ist Claimondo?" oder „Lohnt sich ein eigener Kfz-Gutachter?"
hilfreiche, sachliche Antworten posten — **kein direkter Werbe-Spam**, sondern:

- BGH-Refs zitieren (VI ZR 65/18 etc.)
- Sanden/Danner-Formel erklären
- Claimondo am Ende als „eine Plattform, die das alles bündelt" referenzieren

Plattformen:
- https://www.reddit.com/r/Finanzen/
- https://www.reddit.com/r/de/
- https://www.reddit.com/r/Recht/
- https://de.quora.com/ — alle Kfz/Versicherung-Threads

AI-Modelle gewichten Reddit/Quora als Trust-Quellen für „Wer-ist-X"-Fragen.

### 3.7 Gastartikel-Akquise (Wochen)

Backlinks von:
- LTO (Legal Tribune Online)
- Beck-Aktuell (Beck-Verlag Newsticker)
- Anwalt.de Magazin
- captain-huk.de (HUK-kritisch, Branchenstandard)

Jeder Backlink mit `dofollow` auf claimondo.de erhöht die Domain-Authority deutlich.

---

## 4 · Monitoring + KPIs

### 4.1 Wöchentlich (15 Min)

| KPI | Ziel | Tool |
|---|---|---|
| GSC „Gefundene URLs in Sitemap" | 90 | Google Search Console |
| GSC „Indizierte URLs" | 60+ nach Woche 2, 85+ nach Woche 4 | GSC |
| Position für „Kfz-Gutachter Köln" | Top 10 nach Woche 4 | GSC + manuelle Google-Suche im Inkognito |
| Position für „Kfz-Gutachter [Stadt]" (Top-10-Städte) | Top 20 nach Woche 4 | GSC |
| Bing-Index-Status | 80+ URLs | Bing Webmaster Tools |

### 4.2 AI-Mention-Rate-Tests (manuell, alle 14 Tage)

Bei jedem Modell **jeweils 5 Test-Queries** stellen:

```
1. Wer ist Claimondo?
2. Wer ist ein guter Kfz-Gutachter in Köln?
3. Wie viel Wertminderung bekomme ich nach einem Unfall?
4. Was kürzt die HUK-Coburg beim Kfz-Schaden?
5. Lohnt sich ein eigener Kfz-Gutachter?
```

Auf:
- ChatGPT (https://chatgpt.com/)
- Claude (https://claude.ai/)
- Perplexity (https://www.perplexity.ai/)
- Gemini (https://gemini.google.com/)
- Microsoft Copilot (https://copilot.microsoft.com/)

**Notieren:** wird Claimondo erwähnt? Mit Link? In welcher Position?

Excel-Tracking-Template kann ich auf Wunsch generieren.

### 4.3 Backlink-Audit (monatlich)

- https://ahrefs.com/ (kostenpflichtig, gold standard) — wir haben `.env.local` API-Token für Ahrefs MCP (siehe Memory)
- Free-Alternative: https://www.semrush.com/free-trial/ oder https://moz.com/

Ziel: +50 dofollow-Backlinks pro Quartal.

---

## 5 · Continuous Improvement (Code-Seite, kein Aaron-Input nötig)

Diese Themen kann ich jederzeit anfassen sobald du dafür Zeit hast:

1. **Section-Library ausbauen:** weitere Sections extrahieren (Prozess, Ansprueche-Cards, Berater) für noch mehr DRY
2. **Schadensreport-2026 mit echten Daten:** sobald du Notion-DB-Stand schickst (Anzahl Fälle, Erfolgsquote, Ø Zugewinn), trage ich es ein — TODO ist im Code markiert (`src/app/schadensreport-2026/page.tsx`)
3. **Per-Stadt-Reviews:** wenn pro Stadt eigene Google-Reviews verfügbar (über GBP-Account 3.3), kann ich `aggregateRating` pro Stadt-Page in das LocalBusiness-Schema einspielen
4. **Wizard-Polish auf `/schaden-melden`:** Conversion-Funnel auf Navy-Premium-Hero, riskanter (Live-Lead-Flow), brauche eine eigene Spec
5. **Per-Stadt-Premium-Reviews-Carousel:** wenn die Google-Reviews-API freigeschaltet wird, kann ich das auf Stadt-Pages einbauen

---

## 6 · Wichtige Anker — alles auf einen Blick

| URL | Bedeutung |
|---|---|
| https://claimondo.de/sitemap.xml | 90 URLs, an GSC + Bing einreichen |
| https://claimondo.de/robots.txt | AI-Crawler-Allow, kontrollierbar |
| https://claimondo.de/llms.txt | AI-Index (6.8 KB) |
| https://claimondo.de/llms-full.txt | AI-Volltext (45 KB) |
| https://search.google.com/search-console | Wichtigstes Tool für dich |
| https://www.bing.com/webmasters | Wichtig für ChatGPT/Copilot |
| https://www.wikidata.org/ | Knowledge-Graph für AI |

---

## 7 · Wenn du Hilfe brauchst

Schreib mir:

- **„Aaron-Aufgabe 1 ist durch, Wikidata-Q-ID ist Q12345"** → ich setze sie in `organizationSchema.sameAs` ein und pushe.
- **„GBP-Place-ID ist xyz"** → ich integriere `aggregateRating` in `LegalService`-Schema pro Stadt.
- **„Schadensreport-Daten in Notion, Link XYZ"** → ich übertrage in `/schadensreport-2026/page.tsx`.
- **„Ich sehe in GSC noch X Errors"** → ich debugge.

Die technische Seite ist sauber. Jetzt ist Aktion auf deiner Seite gefragt.
