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
| KI-Crawler | GPTBot ✅ · ClaudeBot ✅ · PerplexityBot ✅ · **CCBot ❌** · **Google-Extended ❌** | `claimondo.de/robots.txt` |
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
   └─► 4. Status 'review'   → **kein Auto-Publish**
   ▼
Redaktion im Admin: lesen, korrigieren, freigeben
   ▼
wissen_artikel-Muster (Speicherung + Rendering) → Seite live
```

**Warum kein Auto-Publish:** Ein Fehler in einem generierten Text ist bei 300 Orten ein Fehler auf 300 Seiten — und UWG-Verstöße (erfundene Zahlen) sind abmahnfähig. Der Admin ist der Gate, genau wie bei Wissen.

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

## 8. Entscheidung nötig: CCBot & Google-Extended

Beide sind aktuell **gesperrt**. Das steht dem Citation-Ziel entgegen:

* **CCBot** (Common Crawl) — Korpus, aus dem viele Modelle schöpfen. Sperre = wir fehlen dort dauerhaft.
* **Google-Extended** — steuert Gemini-/Vertex-**Grounding**. Sperre = keine Nennung in Gemini-Antworten. *(Betrifft **nicht** die AI Overviews der Suche — die laufen über Googlebot und sind erlaubt.)*

**Trade-off:** Freigeben heißt, Inhalte auch für KI-Training zur Verfügung zu stellen. Das ist eine Geschäftsentscheidung, keine technische. **Empfehlung:** freigeben — Sichtbarkeit in KI-Antworten ist genau das erklärte Ziel, und die Inhalte sind ohnehin öffentlich.

---

## 9. Rollout in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **P1** | Geo-Modell + Substanz-Register (DB), 87 Bestandsstädte klassifizieren (Hub/Spot), Lücken wie Gelsenkirchen schließen | Fundament, sofort ~10 fehlende Hubs |
| **P2** | Admin-Oberfläche + Job-Typ `lokal_artikel` auf `marketing_content_jobs` | Steuerbar wie Wissen |
| **P3** | Generator + die 5 Gates, **Pilot mit 5 Orten** | Qualität bewiesen, bevor skaliert wird |
| **P4** | Skalierung nach Substanz — **nur Orte, die das Gate bestehen** | Wachstum ohne Abstrafungsrisiko |
| **P5** | Spots je Hub (Stadtteile/Vororte), Regions-Vergleichsseiten | Hyperlokale Tiefe |
| **P6** | Citation-Monitoring (Ahrefs Brand Radar / Perplexity-Stichproben), Auffrisch-Zyklus | Messbar statt Bauchgefühl |

**Reihenfolge ist kein Zufall:** Erst Substanz, dann Fläche. Andersherum entsteht das, was Google abstraft — und was ohnehin niemand zitiert.

---

## 10. Offene Punkte für Aaron

1. **CCBot/Google-Extended freigeben?** (§8 — Empfehlung: ja)
2. **Wie viele Orte** ist das Ziel? (87 → 150 Hubs? + Spots?) Meine Empfehlung: nicht als Zahl definieren, sondern als Regel *„jeder Ort, der 3 harte Fakten hat"*.
3. **Redaktionelle Freigabe:** Wer klickt „veröffentlichen"? (Bei 300 Orten ist das Arbeit — realistisch stichprobenartig nach bewährter Vorlage?)
4. **Externe Datenquellen** für Gericht/Unfallschwerpunkte: einmalig einpflegen oder automatisiert beziehen?
