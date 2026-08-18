# Design: Hyperlokale Standort-Seiten + KI-Content-Pipeline (Sichtbarkeit & Citations)

**Datum:** 2026-08-12
**Auftrag (Aaron, 12.08.):** Unterseiten hyperlokaler ausrichten (mehr + kleinere Städte, nach **Hubs und Spots**) · alle Marketing-Seiten **und claimondo.de selbst** füllen sich automatisch mit KI-Artikeln, **standortbasiert** · Steuerung über den **Admin, analog zur Wissen-Infrastruktur** · die Artikel müssen **wirklich auf Hyperlokales eingehen** · Ziel: **organische Sichtbarkeit + Citations** in ChatGPT/Perplexity/Google.
**Status:** Entwurf zur Review — nichts gebaut.

---

## 1. Ist-Stand (gemessen, nicht geschätzt)

| Befund | Wert | Quelle |
|---|---|---|
| Städte-Seiten | **87** unter `/kfz-gutachter/[stadt]` | `claimondo-marketing/lib/kfz-gutachter/staedte.ts` |
| Sitemap | **544 URLs** | `claimondo.de/sitemap.xml` |
| Schema je Stadt-Seite | FAQPage (**13 Q&A**), City, LegalService, HowTo, GeoCoordinates, OpeningHours, Service, Offer, Person | Live-HTML `/kfz-gutachter/koeln` |
| KI-Crawler | GPTBot ✅ · ClaudeBot ✅ · PerplexityBot ✅ · ~~CCBot ❌~~ · ~~Google-Extended ❌~~ → **beide freigegeben** (12.08., PR #5189) | `claimondo.de/robots.txt` |
| Echte lokale Substanz | **15** verifizierte SV · **28** Werkstätten · **73** Claims | prod-DB |
| Lücken | `gelsenkirchen` (260 Tsd. Einwohner) und `bocholt` → **404** | Live-Check |
| Content-Pipeline | `marketing_content_jobs` (Status + **Kosten in Cents**) + `/admin/marketing/content-studio` | Repo |
| Wissen-Infrastruktur | `wissen_artikel` / `wissen_themen` + `/admin/wissen-artikel` (Liste/Detail/Actions) | Repo |

**Die gute Nachricht:** Das GEO-Fundament steht bereits — FAQPage, Entity-Schema und KI-Crawler-Freigaben sind da. Es fehlt nicht die Technik, sondern die **Substanz** und die **Fläche**.

**Das eigentliche Problem:** 87 Seiten, aber nur 15 Sachverständige. Für die meisten Städte haben wir **keine eigenen** lokalen Daten. Ohne echte Ortsfakten wird jede zusätzliche Stadt ein Text mit ausgetauschtem Namen — genau das Muster, das Google seit dem **März-2024-Update als „Scaled Content Abuse"** abwertet (und das bei KI-Systemen gar nicht erst zitiert wird, weil es nichts Zitierfähiges enthält).

---

## 2. Zielbild

**Nicht** „mehr Seiten", sondern **mehr zitierfähige Orte**. Erfolg ist erreicht, wenn ein Modell auf die Frage *„Wer erstellt ein Kfz-Gutachten in Gelsenkirchen-Buer?"* Claimondo **mit Ortsbezug** nennt — nicht wenn 300 Seiten existieren.

Messgrößen (in dieser Reihenfolge):
1. **Citations** in ChatGPT/Perplexity/Google AI Overviews auf Ortsfragen
2. Impressions/Klicks der Standort-Seiten (GSC)
3. Indexierungsquote (indexiert ÷ veröffentlicht) — **fällt sie unter 70 %, ist die Substanz zu dünn**

---

## 3. Geo-Modell: Hub · Spot · Region

Aarons Begriffe als Datenmodell (heute: eine flache TS-Liste; künftig: DB, damit der Admin sie pflegen kann):

* **Hub** — Oberzentrum mit **eigener Abdeckung** (SV im Umkreis, Werkstätten, idealerweise abgewickelte Fälle). Bekommt die volle Pillar-Seite. Beispiel: Köln, Düsseldorf, Dortmund.
* **Spot** — Stadtteil, Vorort oder Kleinstadt **im Einzugsgebiet eines Hubs** (Gelsenkirchen-Buer, Köln-Mülheim, Bocholt). Bekommt eine **schlankere** Seite, die ihren Hub kanonisch referenziert und *echte* Spot-Fakten trägt (Zuständigkeiten, Verkehrsachsen, Werkstattdichte).
* **Region** — Klammer für Hubs (Ruhrgebiet, Rheinland). Trägt Vergleichs- und Übersichtsinhalte, auf die Modelle gern zurückgreifen.

**Kanonik-Regel (kritisch):** Ein Spot ohne eigene Substanz bekommt **keine eigene Seite**, sondern einen Abschnitt auf der Hub-Seite. Sonst entstehen Doorway Pages — ein dokumentierter Google-Verstoß.

---

## 4. Das Substanz-Register (Kern des Ganzen)

Vor jedem Artikel steht die Frage: *Was wissen wir über diesen Ort, das ein Wettbewerber nicht generisch hinschreiben kann?* Das Register sammelt genau das — **maschinell prüfbar, mit Quelle**:

| Feld | Beispiel | Quelle | Zitierfähig? |
|---|---|---|---|
| Zuständiges Amts-/Landgericht | „Landgericht Essen" | Justizportal NRW | ✅ hart |
| Verkehrsachsen / Unfallschwerpunkte | „A2, A42, Kreuz Gelsenkirchen" | Destatis / Unfallatlas | ✅ hart |
| Werkstattdichte im Umkreis | „14 freie Werkstätten in 10 km" | eigene DB | ✅ hart |
| Eigene SV-Abdeckung | „3 Sachverständige, Anfahrt < 25 km" | eigene DB | ✅ hart |
| Eigene Fallzahlen / Bearbeitungszeit | „Ø 2,4 Tage bis Gutachten" | eigene DB | ✅ **stärkstes Signal** |
| Regionale Regulierungspraxis | Kürzungsquoten je VS | eigene Fälle | ✅ einzigartig |

**Gate:** Ein Ort braucht **mindestens 3 harte Fakten**, davon **mindestens 1 aus eigenen Daten**, sonst wird nicht publiziert (nur Hub-Abschnitt). Das ist die Bremse gegen Massen-Dünnsinn — und zugleich die ehrliche Antwort darauf, dass wir heute erst 15 SV haben: **die Fläche wächst mit der echten Abdeckung.**

---

## 5. Content-Pipeline (admin-gesteuert, wie Wissen)

Bewusst auf dem **Bestand** aufgebaut statt neu:

```
Admin (/admin/marketing/lokal-content — Muster: /admin/wissen-artikel)
   │  Ort wählen · Vorlage wählen · Job starten
   ▼
marketing_content_jobs  (Status + Kosten in Cents — existiert bereits)
   │
   ├─► 1. Substanz laden   (Register §4; ohne 3 Fakten -> Job bricht ab)
   ├─► 2. Claude generiert  (Prompt bekommt NUR die Fakten + Quellen)
   ├─► 3. Qualitäts-Gates   (§6) — automatisch, blockierend
   └─► 4. Gate bestanden?
          ├─ ja   → Status 'veroeffentlicht'  → **direkt live**
          └─ nein → Status 'in_review'        → Redaktion im Admin
   ▼
wissen_artikel-Muster (Speicherung + Rendering) → Seite live
```

**Auto-Publish nach bestandenem Gate — geändert am 18.08.2026 (Aaron).**
Die ursprüngliche Fassung schrieb hier „kein Auto-Publish" fest, mit der Begründung: *„Ein Fehler in einem generierten Text ist bei 300 Orten ein Fehler auf 300 Seiten — und UWG-Verstöße (erfundene Zahlen) sind abmahnfähig."*

Diese Sorge gilt **ungeprüften** Zahlen. Genau dagegen wurde das Gate gebaut: es verwirft jeden Unfall-Hotspot ohne belegbare Quell-URL und verlangt ≥ 3 harte, extern verifizierbare Fakten. Damit ist es dieselbe Bedingung, unter der Auto-Publish bei der **B2B-Content-Pipeline** seit dem 02.07.2026 läuft („Auto-Publish NUR nach Validierung", Aaron-Entscheid). Die Regel ist also nicht gelockert, sondern über beide Pipelines vereinheitlicht.

Was den Schutz weiterhin trägt: das Gate läuft unverändert, `aktualisiere` schickt auch von Hand ergänzte Inhalte erneut hindurch, und der Marketing-Read filtert `status='veroeffentlicht'` über eine **RLS-Policy** statt im Code — ein vergessener Filter kann keine Entwürfe ausliefern.

Was den Ausschlag gab: Nach vier Tagen mit fertiger Pipeline standen **0 Zeilen** in `stadt_lokalinhalte`. Die Freigabe war nicht das Sicherheitsnetz, sondern der Engpass — gebaut, aber nie ausgelöst.

**Aktualität:** Artikel bekommen ein `stand_am`. Wird ein Fakt neu (mehr SV, neue Werkstatt), markiert der Job den Artikel als *auffrischbar*. Frische ist bei ChatGPT ein starker Citation-Faktor.

---

## 6. Qualitäts-Gates (automatisch, blockierend)

1. **Substanz-Score** ≥ 3 harte Fakten, ≥ 1 aus eigenen Daten (§4).
2. **Uniqueness:** n-Gramm-Überlappung zu allen anderen Ortsseiten **< 40 %**. Darüber = Template-Text → Block.
3. **Zahlen-Herkunft:** Jede Zahl im Text muss aus dem Register stammen (Abgleich). Freihändige Zahlen → Block. *(UWG §5 — dieselbe Regel, die bei `getGoogleReviews` schon gilt: „echt, nie erfunden".)*
4. **Ortsbezug:** Ortsname + mindestens zwei ortsspezifische Entitäten im Text (Gericht, Achse, Stadtteil).
5. **Indexierungs-Wächter:** Fällt die Indexierungsquote einer Charge unter 70 %, stoppt der Rollout automatisch.

---

## 7. GEO-Optimierung (Princeton-Methoden, gewichtet)

Angewandt auf jede Ortsseite — die Prozente sind die gemessenen Sichtbarkeitseffekte:

| Methode | Effekt | Umsetzung hier |
|---|---|---|
| Quellen zitieren | **+40 %** | Gericht → Justizportal, Unfalldaten → Destatis, jeweils verlinkt |
| Statistiken | **+37 %** | eigene Bearbeitungszeiten, Werkstattdichte, Fallzahlen |
| Zitate | **+30 %** | O-Ton des zuständigen Sachverständigen (echt, mit Namen) |
| Autoritativer Ton | +25 % | Fachbegriffe korrekt (Wertminderung, Nutzungsausfall, 130-%-Regel) |
| Verständlichkeit | +20 % | Antwort-zuerst, kurze Absätze |
| **Keyword-Stuffing** | **−10 %** | **verboten** — schadet messbar |

**Struktur je Seite:** Antwort zuerst (Frage → Antwort in Satz 1), dann Fakten, dann FAQ. FAQPage-Schema ist bereits vorhanden und wird um **ortsspezifische** Fragen erweitert (*„Welches Gericht ist bei einem Unfall in X zuständig?"*) — generische Fragen bringen keine Citations, weil sie überall stehen.

---

## 8. CCBot & Google-Extended — ✅ entschieden am 12.08.2026: freigegeben

Beide waren gesperrt, was dem Citation-Ziel entgegenstand:

* **CCBot** (Common Crawl) — Korpus, aus dem viele Modelle schöpfen. Sperre = wir fehlten dort dauerhaft.
* **Google-Extended** — steuert Gemini-/Vertex-**Grounding**. Sperre = keine Nennung in Gemini-Antworten. *(Betraf **nicht** die AI Overviews der Suche — die laufen über Googlebot und waren durchgehend erlaubt.)*

**Aaron-Entscheid: beide freigeben.** Umgesetzt in **PR #5189** auf claimondo.de + den 5 kfz-Cluster-LPs. Die Freigabe läuft über die normale Allow-Liste, trägt also die üblichen Portal-/Auth-Disallows — offen sind nur die öffentlichen Marketing-Seiten. **Bytespider bleibt geblockt** (aggressiver Scraper ohne Zitier-Oberfläche).

Nebenbefund aus der Umsetzung: Die Properties waren auseinandergelaufen — `autounfall-io` hatte den Block nie ausgerollt und erlaubte alle drei.

---

## 9. Rollout in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **P1** | Geo-Modell + Substanz-Register (DB), 87 Bestandsstädte klassifizieren (Hub/Spot), Lücken wie Gelsenkirchen schließen | Fundament, sofort ~10 fehlende Hubs |
| **P2** | Admin-Oberfläche + Job-Typ `lokal_artikel` auf `marketing_content_jobs` | Steuerbar wie Wissen |
| **P3** | Generator + die 5 Gates, **Pilot mit 5 Orten** | Qualität bewiesen, bevor skaliert wird |
| **P4** | Skalierung nach Substanz — **nur Orte, die das Gate bestehen** | Wachstum ohne Abstrafungsrisiko |
| **P5** | Spots je Hub (Stadtteile/Vororte), Regions-Vergleichsseiten | Hyperlokale Tiefe |
| **P6** | Citation-Monitoring (s. §9.1), Auffrisch-Zyklus | Messbar statt Bauchgefühl |

**Reihenfolge ist kein Zufall:** Erst Substanz, dann Fläche. Andersherum entsteht das, was Google abstraft — und was ohnehin niemand zitiert.

### 9.1 Blocker beim Messen: Ahrefs liefert keine Daten

Der Citation-Ist-Stand sollte hier stehen. Er fehlt, weil der Ahrefs-Zugang zwar **verbunden**, der Tarif aber für **jeden** Datenabruf gesperrt ist — am 12.08. geprüft:

| Abruf | Ergebnis |
|---|---|
| `site-explorer-ai-responses-count` (Citations je Plattform: ChatGPT, AI Overviews, Gemini, Perplexity, Copilot, Grok) | `Insufficient plan` |
| `site-explorer-domain-rating` · `site-explorer-metrics` | `Insufficient plan` |
| `public-domain-rating-free` (als *free* deklariert) | `Insufficient plan` |
| `subscription-info-limits-and-usage` (laut Doku „free, verbraucht keine Units") | `Insufficient plan` |

Bemerkenswert: Selbst die kostenlosen Endpunkte und die Kontingent-Abfrage werden abgewiesen — der Tarif erlaubt offenbar gar keine API-Nutzung, nicht bloß eingeschränkte.

**✅ Entschieden am 12.08.2026 (Aaron): Ahrefs bleibt wie es ist** — kein Tarif-Upgrade. Damit ist die Messung **manuell**:

> **Nullmessung vor P4:** ein fester Satz Ortsfragen (z. B. *„Wer erstellt ein Kfz-Gutachten in Gelsenkirchen-Buer?"*, *„Kfz-Sachverständiger Bocholt Kosten"*) wird quartalsweise in ChatGPT, Perplexity und Google gestellt und protokolliert: **Wird Claimondo genannt? An welcher Stelle? Mit welcher Quelle?** Gröber als die API, kostenlos — und ausreichend, um eine Richtung zu erkennen.

Der Fragensatz muss **vor** dem ersten generierten Artikel festgeschrieben und einmal durchlaufen werden, sonst gibt es keinen Vorher-Wert. Als eigener Schritt in P3 (Pilot) verankert, nicht erst in P6.

Ergänzend kostenlos verfügbar: der **VPS-nginx-Log-Grep** nach KI-Bot-User-Agents auf den GEO-Routen (etabliert in `docs/superpowers/specs/2026-08-03-geo-p1-aeo-measurement-design.md`). Er misst zwar Crawling, nicht Citations — beantwortet aber die vorgelagerte Frage, ob die Bots die neuen Seiten überhaupt abholen.

---

## 10. Offene Punkte für Aaron

**Erledigt am 12.08.2026:**
* ✅ **CCBot/Google-Extended freigegeben** (§8) → PR #5189
* ✅ **Ahrefs bleibt wie es ist** (§9.1) → Messung läuft manuell, Fragensatz in P3

**Noch offen:**
1. **Wie viele Orte** ist das Ziel? (87 → 150 Hubs? + Spots?) Meine Empfehlung: nicht als Zahl definieren, sondern als Regel *„jeder Ort, der 3 harte Fakten hat"*.
2. **Redaktionelle Freigabe:** Wer klickt „veröffentlichen"? (Bei 300 Orten ist das Arbeit — realistisch stichprobenartig nach bewährter Vorlage?)
3. **Externe Datenquellen** für Gericht/Unfallschwerpunkte: einmalig einpflegen oder automatisiert beziehen?
