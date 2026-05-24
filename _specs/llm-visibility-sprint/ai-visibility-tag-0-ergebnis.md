# AI-Visibility Baseline — Tag 0 (2026-05-24)

Mess-Basis (Stream J) für den 90-Tage-GEO-Sprint. Prompt-Set: Doc 13 §8 (30 Test-Prompts). Rohdaten: `ai-visibility-tag-0.csv`.

## Methode + ehrliche Grenzen
- **Gemessen via Claude-`WebSearch` (US-Region)** als reproduzierbarer Proxy für „Surfacet claimondo/autounfall organisch?". **NICHT** der literale 4-Engine-Klick-Test (ChatGPT/Perplexity/Gemini/Google-AI) — das kann diese Session technisch nicht ausführen.
- **US-Region** verzerrt deutsche SERPs → der Proxy ist am aussagekräftigsten für **Brand-/Indexierungs-Surface**, schwächer für generische DE-Queries.
- **Ahrefs Brand Radar** (das eigentliche AI-Response-Mention-Tool) war **nicht verbunden** (MCP disconnect). → Empfehlung unten.
- 8 von 30 Prompts gemessen (über alle 6 Kategorien gestreut); die übrigen 22 stehen in der CSV als `ausstehend` für den vollen Pass.

## Befund Tag 0
- **claimondo / autounfall.io / kfz-gutachter-dortmund.de: 0/8 gesurfacet** — in keinem Result-Set, auch nicht bei den Brand-Queries („Was ist Claimondo?", „autounfall.io was ist das?"). → **AI-/Such-Visibility ≈ 0.** Das ist der erwartete, gewollte Startpunkt.
- **Benchmark-Konkurrent: `autocrashexpert.de`** — surfacet in **4/8** der Ziel-Queries (Kosten, Unverschuldeter-Unfall-Rechte, Gutachter-Köln, Schadensregulierung, Gutachter-akzeptieren). Genau die Blaupause, nach der Doc-26-Stream-B modelliert wurde.
- Weiteres Wettbewerbsfeld: CLAYM+, UNFALLNAVI, SchadenPro, DSR24, fairforce.one, die-kfzgutachter.de, bussgeldkatalog.org (Info-Autorität), unfallhelden.de.

## Strategische Lesart
Dass `autocrashexpert.de` für **genau die Queries** rankt, die unsere neuen B.1/B.2/B.4/B.5-Pages adressieren, **validiert die Query-Auswahl** — die Seiten zielen richtig. Tag 0 = 0 Sichtbarkeit; die Aufgabe der nächsten 90 Tage ist, für diese Queries in AI-Antworten/SERPs aufzutauchen (On-Site-Fundament steht + ist crawlbar/geschemt, siehe `docs/24.05.2026/seo-geo-capability-audit.md`).

## Wachstumsziele (Doc 13)
| Zeitpunkt | Ziel |
|---|---|
| Tag 30 | ~3/30 Prompts mit Erwähnung in 1+ AI-Engine |
| Tag 60 | ~7/30, 3+ in 2 Engines |
| Tag 90 | 12+/30, 6+ in 2 Engines, 3+ in 3 Engines |

## Nächste Schritte
1. **Ahrefs Brand Radar** für claimondo.de konfigurieren (AI-Response-Mentions/Share-of-Voice) — autoritativer als WebSearch-Proxy, automatisch trackbar.
2. **Manueller 4-Engine-Pass** der 30 Prompts (ChatGPT/Perplexity/Gemini/Google-AI) durch Aaron — füllt die `ausstehend`-Zeilen mit echten AI-Antwort-Daten.
3. **Tag-30-Re-Messung** mit derselben CSV (neue Spalten `*_tag30`).
