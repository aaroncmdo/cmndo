# GEO-Baseline 2026-05-09

**Erstellt vor Live-Bringen** der GEO-Maßnahmen Tier 1 (Schema breitflächig, Answer-Capsules, Brand-Identity Über-uns).

Diese Baseline dient als **Vorher-Stand** für die Wirkungsmessung in 4–8 Wochen (≈ 06.06.–04.07.2026).

## Methodik

10 Testfragen aus dem Aaron-Briefing 08.05.2026 manuell an die vier wichtigsten AI-Suchmaschinen schicken:

- **ChatGPT** (mit Browsing) — `chatgpt.com`
- **Perplexity** — `perplexity.ai`
- **Claude** (mit Web-Search via Brave) — `claude.ai`
- **Gemini** (Google AI Overview) — `gemini.google.com` + `google.com`-AI-Overview

Pro Frage notieren:
- Wird **Claimondo** in der Antwort genannt? (ja/nein)
- Wenn ja: an welcher Position (1, 2, 3 …) und mit welcher Quelle (`claimondo.de` direkt zitiert)?
- Welche Konkurrenten werden zitiert? (`unfallpaten.de`, `ihre-kfz-gutachter.com`, `schaden-schnell-hilfe.de`, …)
- AI-Antwort-Snippet kurz festhalten (1 Satz)

## Die 10 Testfragen

1. Unfallgutachter Köln empfehlen
2. KFZ Schadensregulierung online Deutschland
3. Versicherung kürzt Unfallgutachten was tun
4. Beste Plattform Unfallschaden Abwicklung
5. Was kostet KFZ Gutachter nach Unfall
6. Unabhängiger Sachverständiger NRW
7. Haftpflichtschaden regulieren kostenlos
8. Wertminderung nach Autounfall berechnen
9. HUK kürzt Gutachten Erfahrungen
10. Digitale Schadensregulierung Plattform Deutschland

## Erwartung (Hypothese vor Messung)

Aus der Wettbewerber-DB-NRW-Erkenntnis: **0 % AI-Sichtbarkeit bei allen 23 NRW-Wettbewerbern.** Wir gehen davon aus dass Claimondo bei der Baseline-Messung in 0/10 Fragen zitiert wird.

Wenn die Baseline das bestätigt: erwartete Steigerung nach 4–8 Wochen Live-Maßnahmen ≥ 1 Citation in Top-10-Antworten ist Erfolg.

## Baseline-Ergebnis (auszufüllen vor Re-Test)

| # | Frage | ChatGPT | Perplexity | Claude | Gemini |
|---|-------|---------|------------|--------|--------|
| 1 | Unfallgutachter Köln | ___ | ___ | ___ | ___ |
| 2 | KFZ-Reg online DE | ___ | ___ | ___ | ___ |
| 3 | VS kürzt Gutachten | ___ | ___ | ___ | ___ |
| 4 | Beste Plattform Unfall | ___ | ___ | ___ | ___ |
| 5 | Was kostet Gutachter | ___ | ___ | ___ | ___ |
| 6 | Unabhängiger SV NRW | ___ | ___ | ___ | ___ |
| 7 | Haftpflicht kostenlos | ___ | ___ | ___ | ___ |
| 8 | Wertminderung berechnen | ___ | ___ | ___ | ___ |
| 9 | HUK kürzt | ___ | ___ | ___ | ___ |
| 10 | Digitale Plattform DE | ___ | ___ | ___ | ___ |

**Format pro Zelle:** `nicht zitiert` / `Pos 3 (claimondo.de/ueber-uns)` / `gemerkt: <Snippet>`

## Re-Test-Plan

- **Erste Re-Messung:** ~04.06.2026 (4 Wochen nach Live)
- **Zweite Re-Messung:** ~04.07.2026 (8 Wochen nach Live)
- **Quartalsweise:** danach jeden 1. des Monats

Für jede Re-Messung neue Datei `geo-baseline-YYYY-MM-DD.md` anlegen, NICHT die Baseline überschreiben.

## Maßnahmen die zwischen Baseline und Re-Test live gehen

### PR #682 (live)
- Schema-Stack Tier 1 breitflächig: Organization + LocalBusiness + WebSite global im Layout
- WebPage-Schema auf Legal-Pages
- Doppelte Schema-Aufrufe entfernt

### PR #683 (live)
- Answer-Capsules auf `/vorteile` (2x mit BGH-Citations)
- Answer-Capsule auf `/wie-es-funktioniert` (3-Schritt-Pipeline mit ETA)

### PR #681 (live, vor Baseline)
- Brand-Identity + Über-uns Entitäts-Definition (200 Wörter)
- `organizationSchema` mit `slogan`, `legalName`, `knowsAbout` (12 Domänen), `memberOf`

### Pending (nach Baseline)
- Sitemap-Vervollständigung (Legal + Gutachter-Partner)
- Schadensreport 2026 (Originaldaten — höchster GEO-Hebel)
- Third-Party-Validierung (Gastartikel, Presse)
- Backlinks aus Partner-Netzwerk

## Lese-Empfehlungen für Re-Test

- **Princeton GEO Methods** — siehe `references/geo-research.md` im seo-geo Plugin-Cache
- **Schema-Markup Wirkung** — 73 % Verbesserung bei AI Overview (laut Briefing)
- **FAQPage-Schema** — +40 % AI-Visibility (Princeton)
