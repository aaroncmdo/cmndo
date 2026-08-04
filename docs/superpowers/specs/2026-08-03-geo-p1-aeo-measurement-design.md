# GEO-Programm P1 — AEO-Mess-Harness (Design)

**Datum:** 2026-08-03
**Status:** Design (brainstorming) — Aaron-Review vor writing-plans
**Branch:** `kitta/geo-content-program`
**Autor:** Session 3f0a77b7 (Opus 4.8)

---

## Programm-Kontext

GEO-Programm = 3 Tranchen (Aaron-Entscheid „alle"), je eigener Spec→Plan→Bau-Zyklus, seriell abgearbeitet:

- **P1 (dieser Spec) — Messung/Diagnostik.** Foundation, null externe Blocker. Liefert die actionable Gap-Liste (priorisiert P3) + den KPI-Baseline (misst P2/P3-Wirkung).
- **P2 — Daten-Moat.** `kuerzungen`-Tracking-Schema + Schadensreport-Daten-Pipeline („Baum jetzt pflanzen": Daten laufen ab jetzt auf).
- **P3 — Flagship-Content.** Interaktive Rechner + „vs-Wettbewerber"/„Testsieger"-Vergleiche + `sameAs`/Wikidata-Entity-Anchoring, **priorisiert durch P1**.

Dieser Spec deckt **nur P1**. P2/P3 bekommen eigene Specs.

---

## Problem

Die GEO-**Angebots**maschine ist außergewöhnlich vollständig gebaut: 85 Stadt-Pages (16 Bundesländer), 57 Haftpflicht-Spokes, Decoder, Vergleichs-Seiten, FAQ (45 Q&A), voller JSON-LD-Stack (FAQPage/HowTo/Article/LocalBusiness/LegalService/Dataset), tiefe `llms.txt`+`llms-full.txt`, Feeds+Sitemap+IndexNow, AI-Bot-Allowlist, Read+Write-API, MCP-Server, ChatGPT-Custom-GPT, tägliche Wissen-KI-Pipeline.

**Aber die Mess-Schleife wurde nie geschlossen.** Es existieren nur Tag-0 (`geo-tag0-2026-05-10.md`, 0/40 Citations) und die Zwischenmessung (`geo-messung-2026-05-24.md`, weiterhin 0). Die geplanten 4-Wochen- (07.06.) und 8-Wochen-Re-Tests (05.07.) haben **kein Ergebnis-Dokument** in `docs/geo/`. Folgen:

1. **Kein rigoroser Beleg**, ob die gebaute Maschine je AI-Citations erzeugt hat (die 31.07.-Momentaufnahme war ein SERP-Proxy, keine AI-Antwort-Messung).
2. **Keine datenbasierte Priorisierung** für P2/P3 — jeder weitere Content wäre geraten statt gemessen.
3. Das dokumentierte Phase-2/Write-Gate („messbarer LLM-Traffic") wurde formal nie sauber ausgelöst.

Der ursprünglich geplante Mess-Weg (**Ahrefs Brand-Radar**) ist **nicht verfügbar**: die ganze Ahrefs-API liefert `Insufficient plan` (verifiziert 2026-08-03, auch der kostenlose `subscription-info`-Endpoint). Wir brauchen einen Ahrefs-freien Mechanismus.

---

## Ziel

Ein **repeatbarer, automatisierter AEO-Mess-Harness**, der den (Mai-kompatiblen) Zielquery-Satz durch **Claude-mit-Web-Search** jagt, Claimondos Sichtbarkeit / Zitierung / Sentiment gegenüber Wettbewerbern scored und ein **datiertes Ergebnis-Dokument + eine actionable Gap-Liste** produziert.

**Erfolgskriterium P1:** Ein Baseline-Lauf existiert als `docs/geo/measurements/2026-08-03-aeo-run.md` mit echten API-Antworten, plus ein re-ausführbares Script, das jeden künftigen Lauf mit einem Kommando reproduziert.

**Nicht-Ziel:** Traffic/Rankings *verbessern* (das ist P2/P3). P1 *misst* nur — und macht die Verbesserung messbar.

---

## Architektur

Drei Schichten. **Schicht A** ist das gebaute, automatisierte Artefakt; **B** und **C** sind manuelle/periodische Baseline-Layer, die den ersten Lauf anreichern.

### Schicht A — Automatisierter Kern (das Deliverable)

`scripts/geo/measure-aeo.mjs` — vier Stufen:

1. **Query-Runner.** Je Query ein Claude-API-Call mit dem `web_search`-Server-Tool (Live-Web-Grounding → reflektiert echtes Retrieval-/Synthese-Verhalten, nicht Trainingswissen). Modell konfigurierbar, Default `claude-opus-4-8`; Tool-Version `web_search_20260209` (**exakte Bindung + Citation-Parsing zur Bauzeit via `claude-api`-Skill verifizieren**). Streaming für lange Läufe. Nutzt den bestehenden `@anthropic-ai/sdk`-Setup + `ANTHROPIC_API_KEY`.

2. **Deterministischer Extraktor** (objektiv, keine Modell-Bewertung):
   - `claimondo_present`: Regex `claimondo` (case-insensitive, **Wort-Grenze** — `Klimondo`-Tippfehler zählt NICHT) im Antwort-Text.
   - `claimondo_cited`: eine `claimondo.de` / `app.claimondo.de` / `autounfall.io`-URL in den `web_search`-Zitatquellen der Antwort.
   - `competitors_present` / `competitors_cited`: gegen die Wettbewerber-Liste (ADAC, DAT, bussgeldkatalog.org, Neogutachter, Unfallpaten, Unfallgiganten, TÜV SÜD, bvs-ev.de, autohaus.de).

3. **LLM-Judge-Pass** (die subjektiven Rubrik-Dimensionen, im Output klar als *modell-bewertet* gelabelt): ein zweiter Claude-Call bewertet die Antwort 0–10 auf **Accuracy** (stimmt, was über Claimondo/das Thema gesagt wird?), **Sentiment** (Ton ggü. Claimondo) und **Completeness** (deckt die Antwort die Nutzer-Intention ab?). Pattern: LLM-as-judge, separater Call, striktes JSON-Output-Schema.

4. **Doc-Writer.** Schreibt `docs/geo/measurements/YYYY-MM-DD-aeo-run.md`: pro Query eine Zeile (present / cited / competitors / 6-Dim-Scores), das Aggregat (Citations X/15, gemittelter 6-Dim-Score) und die **Gap-Liste** (s.u.). Idempotent pro Datum-Lauf.

### Schicht B — Cross-Engine-Baseline (manuell/periodisch, beim Baseline-Lauf)

Kein API-Zugang zu ChatGPT/Perplexity/Gemini. Beim Baseline-Lauf ergänze ich (Session) daher:
- **Google-SERP + AI-Overview** für dieselben Queries via `WebSearch`/`WebFetch` (reflektiert Googles AI-Antwort) — das ist das primäre, hier machbare Cross-Signal.
- **ChatGPT / Perplexity / Gemini**: manueller/periodischer Spot-Check (kein API-Zugang; ggf. Aaron oder Browser). Bewusst **nicht** pro Lauf — periodisch als Tiefen-Snapshot.

Alles ins selbe datierte Doc, klar als „manuell/Schicht B" markiert.

### Schicht C — Crawler-Log-Signal (leading indicator, beim Baseline-Lauf)

VPS-Log-Grep (nginx access-Log) nach AI-Bot-User-Agents — `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `Google-Extended` — auf den GEO-Routen (`claimondo.de/kfz-gutachter/*`, `/haftpflicht/*`, `/decoder/*`, `/llms.txt`, `/llms-full.txt`). Zeigt, ob die Bots die Maschine überhaupt crawlen (Voraussetzung für Citation). Zugang: `~/.ssh/claimondo_vps`. Ergebnis (Bot × Route × Häufigkeit) ins Doc. **Bewusst Read-only**, keine Server-Mutation.

---

## Query-Satz (Vergleichbarkeit mit Mai-Baseline)

Verbatim-Quelle: `docs/geo/geo-tag0-2026-05-10.md` (10) + `geo-messung-2026-05-24.md` (5 Journey-Prompts). **Der Build liest die Queries verbatim dort** und legt sie als data-driven Config `scripts/geo/aeo-queries.json` ab (Feld je Query: `text`, `cluster` [Awareness/Consideration/Decision/Trust/Branded], `claimondo_relevanz` [erwartet hoch/mittel]).

Bekannter Satz (Build verifiziert Wortlaut):

**Tag-0 (10):** Unfallgutachter Köln · KFZ-Regulierung online DE · „Versicherung kürzt Gutachten was tun" · beste Plattform Unfallabwicklung · was kostet KFZ-Gutachter · unabhängiger SV NRW · Haftpflichtschaden kostenlos · Wertminderung berechnen · „HUK kürzt Gutachten Erfahrungen" · digitale Schadensregulierung DE.

**Journey (5):** „Wie finde ich unabhängigen SV?" · „Vergleich Gutachter-Vermittlungsportale" (Content-Gap, hoher Hebel) · „Online-Kfz-Gutachten — geht das?" (Risiko-Topic LG Bremen) · „Schneller Gutachter — wer kommt sofort?" · „Was ist Claimondo?" (Branded — `Klimondo`-Halluzinations-Check).

Neue Queries können später in die Config; der Baseline-Lauf bleibt aber auf diesen 15 für die Mai-Vergleichbarkeit.

---

## Scoring-Rubrik (Doc-kompatibel)

Die 6-Dimensionen-Rubrik der bestehenden Mess-Docs (je 0–10) + Citations X/15:

| Dimension | Quelle | Mechanik |
|---|---|---|
| Presence | deterministisch | Claimondo im Antwort-Text (Wort-Grenze) |
| Position | deterministisch | erste Erwähnung vor/nach Wettbewerbern; zitiert vs. nur genannt |
| Consistency | deterministisch | über die Queries hinweg stabil erwähnt? |
| Accuracy | LLM-Judge | stimmt das Gesagte? |
| Sentiment | LLM-Judge | Ton ggü. Claimondo |
| Completeness | LLM-Judge | deckt die Antwort die Intention ab? |

Aggregat = Citations X/15 + gemittelter 6-Dim-Score. Das Doc führt — wie die Mai-Docs — **beide** Zahlen: den „geschönten" (n/a→neutral) und den ehrlichen Score, um Selbsttäuschung zu vermeiden.

---

## Output — die Gap-Liste (der eigentliche Deliverable)

Pro **verlorener** Query (Claimondo nicht präsent/zitiert):

> Query „X" → Claimondo fehlt. Stattdessen zitiert: [Domains]. Wahrscheinlicher Fix: [Content-Typ, z. B. „interaktiver Wertminderungs-Rechner" / „vs-Vergleichsseite" / „Entity-sameAs gegen Klimondo"].

Die **Fix-Zuordnung** ist eine leichte **manuelle** Annotation (Query-Cluster → Content-Typ, informiert vom Content-Inventar aus der Exploration) — **kein** automatischer Klassifikator (YAGNI). Der Harness *misst* deterministisch; die *Interpretation/Priorisierung* ist menschlich und lebt im Ergebnis-Doc.

Aggregat: gewonnene vs. verlorene Queries, Share-of-Voice ggü. Wettbewerbern, **Delta zur Mai-Baseline (0/40)**. Diese Liste ist der direkte, priorisierte Input für **P3** (welcher Content zuerst) und der KPI-Nullpunkt für **P2**.

---

## Datenfluss

```
aeo-queries.json
   → runner (Claude + web_search)         [Schicht A.1]
   → raw response (Text + Zitat-URLs)
   → extractor (present/cited/competitors) [A.2, deterministisch]
   → judge (accuracy/sentiment/completeness)[A.3, LLM]
   → scorer (6-Dim + X/15)
   → doc-writer → docs/geo/measurements/YYYY-MM-DD-aeo-run.md  [A.4]

Baseline-Lauf zusätzlich:
   + Schicht B (Google SERP/AI-Overview manuell; ChatGPT/Perplexity/Gemini periodisch)
   + Schicht C (VPS-Crawler-Log-Grep)
   → dasselbe Doc
```

---

## Datei-Struktur

- `scripts/geo/measure-aeo.mjs` — Orchestrator (Runner → Extractor → Judge → Scorer → Writer).
- `scripts/geo/aeo-queries.json` — data-driven Query-Config + Wettbewerber-Liste.
- `scripts/geo/lib/aeo-extract.mjs` — deterministischer Extraktor (pure, unit-getestet).
- `scripts/geo/lib/aeo-score.mjs` — Scorer/Aggregat (pure, unit-getestet).
- `scripts/geo/lib/aeo-extract.test.mjs` / `aeo-score.test.mjs` — Vitest.
- `docs/geo/measurements/2026-08-03-aeo-run.md` — der Baseline-Lauf (Output).

Trennung: die **pure Logik** (extract/score) ist getrennt vom **I/O** (API-Calls, Doc-Write), damit sie ohne Live-API unit-testbar ist.

---

## Fehlerbehandlung

- **API-Fehler/Timeout je Query:** Retry 2× (Backoff), dann Query als `error` markieren — **Lauf nicht abbrechen**. Das Doc listet Fehl-Queries.
- **`web_search` liefert nichts:** als `no_web_result` markieren (unterscheidbar von „Claimondo absent") — sonst würde eine Suchpanne als Sichtbarkeits-Null fehlinterpretiert.
- **Kein `ANTHROPIC_API_KEY`:** harter Abbruch mit klarer Meldung (kein stiller Leerlauf).
- **Judge liefert kein valides JSON:** Retry 1×, dann die 3 Judge-Dimensionen als `n/a` (deterministische Dimensionen bleiben gültig).
- **Kosten:** 15 Queries × (1 Runner + 1 Judge) ≈ 30 Calls/Lauf — trivial.

---

## Testing

- **Vitest** für `aeo-extract` + `aeo-score` gegen Fixture-Antworten: Präsenz-Fall, Nur-Text-ohne-Zitat-Fall, Zitat-Fall, Wettbewerber-Fall, **Kantenfall `Klimondo`-Tippfehler ≠ Claimondo**, `no_web_result`, leere Antwort.
- **Kein** Unit-Test der Live-API (Integration) — der Baseline-Lauf mit echten Antworten ist der Real-Beleg.
- **Regel 4 (Prod-Smoke):** P1 hat **kein** User-Runtime-Surface (reines `scripts/`-Analyse-Tool, keine Route/Server-Action/DB-Write-Pfad) → Prod-Playwright-Smoke **n/a** (im PR vermerken). Verifikation = tatsächlicher Baseline-Lauf mit realen API-Antworten + committetes Ergebnis-Doc.

---

## Nicht in P1 (YAGNI)

- Kein Cron/Scheduling (später; P1 = Harness + 1 Baseline-Lauf).
- Kein Dashboard-UI (Markdown-Doc genügt).
- Keine ChatGPT/Perplexity/Gemini-Automatisierung (kein API-Zugang; manueller Layer B).
- Kein Ahrefs (plan-gesperrt).
- Keine Content-Änderungen (das ist P3).

---

## Abhängigkeiten

- Bestehender `@anthropic-ai/sdk`-Setup + `ANTHROPIC_API_KEY` (`.env.local` / VPS).
- `claude-api`-Skill zur Bauzeit für exakte `web_search`-Bindung (Tool-Typ, Citation-Block-Parsing, Streaming).
- VPS-Log-Zugang für Schicht C (`~/.ssh/claimondo_vps`, Read-only).

---

## Wie P1 P2/P3 speist

- **Gap-Liste → P3-Priorisierung:** verlorene Queries + wahrscheinlicher-Fix-Content bestimmen die Bau-Reihenfolge in P3.
- **Baseline-Score → KPI:** nach jedem P2/P3-Ship wird der Harness re-ausgeführt; das Delta gegen diesen Baseline belegt Wirkung (oder deren Ausbleiben) — die Schleife, die seit Mai offen war, ist damit geschlossen.
