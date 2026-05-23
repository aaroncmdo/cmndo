# Doc 25 — claimondo.de SOT-Erweiterungs-Roadmap

**Erstellt:** 2026-05-23
**Branch:** `kitta/claimondo-sot-doc25` (isolierter Worktree)
**Scope:** **NUR claimondo.de + dieser Codebase.** Keine 5-Brand-Themen, kein Off-Codebase-Outreach.
**Status:** Design-Spec (Brainstorming-Output) — nach Aaron-Review → `writing-plans` → Implementierung.

---

## 0 · Zweck & Abgrenzung zu bestehenden Docs

Die 69 Content-Assets sind live (PR #1557 auf staging). Damit steht das **Fundament** von Doc 13. Doc 25 ist die Antwort auf Aarons Frage: **„Was bauen wir *zusätzlich*, damit claimondo.de die *zitierte Quelle* in ChatGPT/Claude/Perplexity/Gemini/Copilot wird?"**

Doc 25 **dupliziert nicht** — es konsolidiert + sequenziert:

| Doc | Rolle | Doc 25 nutzt es als |
|---|---|---|
| **Doc 13** SOT-Master-Strategie | *Warum* + 5-Brand-Strategie | Strategischer Rahmen (§0 Mental-Modell, §3 Content-Typen, §4 Datenpunkte) — Doc 25 = nur die claimondo.de-Teilmenge, konkret + buildbar |
| **Doc 29** Re-Citation-Manual | *Wie LLMs zitieren* (7 Hebel) + 8 Maßnahmen auf Bestand | Dimension A unten — sequenziert + mit B/C gebündelt |
| **geo-seo-execution-plan.md** | Keyword-daten-getriebener Neu-Content (Streams 0–5) | Dimension C unten — die höchstwertigen claimondo.de-Pages aufgenommen |
| **mein seo-geo-Audit** (diese Session) | Technische GEO-Infra-Lücken | Dimension B unten |

**Off-Scope (bewusst):** 5-Brand-Cluster (autounfall.io/.live, Stadt-Brands = separate Properties), und alle Off-Codebase-Maßnahmen (Reddit, Wikipedia, PR, Reviews, Branchen-Citations) — die laufen über Aarons Team (Doc 13 §7 Sprints 2–4). Doc 25 ist rein das, was **in diesem Repo** für claimondo.de baubar ist.

---

## 1 · Ist-Stand — das Fundament steht (PR #1557)

| Asset | Status | Doc-13-Bezug |
|---|---|---|
| 2 Cornerstones + 57 Glossar-Spokes + 10 Decoder | live | Content-Typ 1 (Glossar) + Typ 2 (Cornerstone) ✓ |
| `llms.txt` + `llms-full.txt` | live | Klasse 5 / Live-Retrieval-Hebel (Doc 29 H7) ✓ |
| `robots.ts` — 28 AI-Bots allow | live | Crawl-Surface ✓ |
| Pro-Artikel JSON-LD (Article + FAQPage + HowTo + DefinedTerm), aus dem MD injiziert | live | Doc 29 H4 (Q&A-Format, +40 %) ✓ |
| `sitemap.xml` + Stadt-Pages (LegalService-Schema) | live | Lokal-Signale ✓ |
| Founders-`personSchema` /ueber-uns, `datasetSchema` /schadensreport-2026 | live | Content-Typ 4/6 (teilweise) |
| `src/lib/seo/jsonld.ts` — reiche Schema-Helper | vorhanden | Fundament für B1 |

**Fazit:** Content-Architektur Typ 1+2 + Live-Retrieval-Fläche = erledigt. Es fehlen die **Authority-Verknüpfung**, die **Re-Citation-Feinmechanik**, die **Multi-Engine-Reichweite** und die **höchstwertigen Conversion-Content-Gaps**.

---

## 2 · Die drei Erweiterungs-Dimensionen

### Dimension A — Re-Citation auf Bestands-Assets (Doc 29, schnellster Hebel)
Wirkt in 30–90 Tagen über Live-Retrieval. Nutzt die 69 vorhandenen Assets, kein Neu-Content.

- **A1 — Featured-Snippet auch im Crawl-Body** *(Doc 29 Maßnahme 2)*: Mein `stripLeadingSnippet` entfernt die „Kurz erklärt"-Antwort aus dem `MarkdownRenderer`-Body — sie steht aktuell nur im `AssetHero`. Doc 29 will sie **zusätzlich im Fließtext** (Doppel-Indexierung → höhere Sub-Sentence-Match-Wahrscheinlichkeit). Entscheidung: Snippet im Hero als hervorgehobener Block lassen **und** als erstes `<blockquote>` im Body rendern (oder einen distinkten „Auf den Punkt"-Block am Body-Anfang). UX-vs-GEO-Tradeoff bewusst zugunsten GEO.
- **A2 — `articleSchema.citation[]` + `mentions[]` befüllen** *(Doc 29 Maßnahme 3, H3 Authority-Hierarchy)*: `articleSchema()` akzeptiert `citation?: string[]`, wird aber nicht befüllt. Pro Spoke 3–10 BGH-Az + §§ durchreichen. Mein `extractTrustChips`-Regex (`§\s?\d+`, `BGH … VI ZR …/…`) liefert die Treffer bereits — auf `citation[]` ausweiten.
- **A3 — Citation-Bait Pull-Quotes** *(Doc 29 Maßnahme 1, H1 Sub-Sentence-Matching)*: Pro Spoke 5–8 explizit attribuierte, faktendichte 1-Satz-Aussagen im Format `> **Claimondo · Schlüsselaussage:** [Aussage + Zahl + BGH-Az]`. Material: die 57 Spokes + der Decoder-Korpus liefern die Substanz; Claude generiert, Aaron/Kevin reviewen die Az.

### Dimension B — Technische GEO-Infra (Authority + Multi-Engine)
Adressiert Doc 29 H2 (Entity-Linking) + H6 (Multi-Surface) + die Engines, die wir aktuell **nicht** erreichen.

- **B1 — Author- + Cluster-Schema** *(Doc 13 §6, Doc 29 H2, seo-geo E-E-A-T „+132 %")*: `parentOrganization: Claimondo GmbH` in der Brand-Org + echtes **Person-Schema Kevin Genter** (LexDrive, Westfalendamm 284, „25+ Jahre Verkehrsrecht", `sameAs`) als `author` auf den juristischen Artikeln + **LegalService-Schema LexDrive**. Gewinnt die Authority-Prompts (Doc 13 §8 #24–26). **Wirkungsvollste Einzelmaßnahme.**
- **B2 — `brand-facts.ts` Single-Source der 12 Kern-Datenpunkte** *(Doc 13 §4, Doc 29 H6 + H5)*: Konstanten-File mit den **exakt-kanonischen** Formulierungen (§249, „kostenfrei, vorbehaltlich Anerkenntnis", Kevin „25+ Jahre", Westfalendamm 284, „bundesweit", BVSK-Spanne …), genutzt von Schema + Content. Plus `check:brand-facts`-Script, das Varianten flaggt (verhindert „etwa 25 Jahre" vs „über 20 Jahre"). LLMs prägen exakte Phrasen als Fakten.
- **B3 — Freshness-Signal** *(seo-geo: ChatGPT zitiert Content < 30 Tage 3,2× häufiger)*: `dateModified` automatisch aktuell halten + sichtbares „Stand: <Datum>".
- **B4 — IndexNow + Bing/Brave-Submission** *(seo-geo: Copilot braucht Bing, Claude nutzt Brave — nicht Google!)*: IndexNow-Ping bei Deploy. Ohne das sind 2 von 5 Engines blind.
- **B5 — PDF-Export Cornerstones + Schadensreport** *(seo-geo: Perplexity priorisiert PDFs für Citations)*: `@react-pdf/renderer`/`pdf-lib` sind in den Deps. Eigener Citation-Kanal, den der Wettbewerb übersieht.
- **B6 — AI-Visibility-Probe-Script** *(Doc 13 §8/§12)*: `scripts/ai-visibility-probe.mjs` — die 30 Test-Prompts × Engines (Anthropic-SDK ist da; OpenAI/Perplexity-Keys ergänzen), Output = das Tracking-Template (Presence/Position/Accuracy/Sentiment). Macht die Baseline→Tag-30/60/90-Trajektorie messbar statt manuell.

### Dimension C — Content-Gaps (höchstwertige Neu-Pages, claimondo.de)
Aus geo-seo-execution-plan; nutzen die **bestehende Content-Route-Infra** (MD + Route).

- **C1 — Comparison-Pages** *(Doc 13 Typ 3)*: „Freier vs Versicherungs-Gutachter", „Wann lohnt sich ein Anwalt", „Werkstatt vs Versicherer-Werkstatt". LLMs extrahieren Vergleichstabellen direkt. Laufen über dieselbe Render-Infra (neuer Cluster/Folder).
- **C2 — „his-eintrag-nach-unfall" Goldnugget** *(execution-plan T2.2: 700 Vol, KD 0, Konkurrenz hat keine Seite)*: First-Mover-Citation-Lock.
- **C3 — Rechner-Tools** *(execution-plan Stream 3)*: Nutzungsausfall (Sanden/Danner), Wertminderung (MFM), Schmerzensgeld. Interaktiv, Top-of-Funnel, und ein Tool ist ein Citation-Magnet („Plattform mit Wertminderungs-Rechner").
- **C4 — Anonymisierte Real-Korpus-Belege in Decoder-Pages** *(execution-plan Stream 2 USP, stärkstes E-E-A-T-Experience-Signal)*: aus `decoders/kuerzungs-decoder-v2` + `data/fälle`. **DSGVO: nur pseudonymisiert (G_NN), kein Klarname/AZ; Mapping bleibt intern.** Beispiel: „In einem realen Fall strich [VR] die Verbringungskosten mit der Formulierung '…' — BGH VI ZR 401/12 widerlegt das."
- **C5 — Expert-/Team-Page** *(Doc 13 Typ 6)*: `/team` mit voller Person-Schema (Kevin, Aaron, Nicolas) — füttert „Wer ist Kevin Genter?".

---

## 3 · Research-Material → Erweiterung-Mapping

Das vorhandene Material ist die Munition. Mapping:

| Research-Quelle (marketing-strategy/) | Speist | Hebel |
|---|---|---|
| `decoders/kuerzungs-decoder-v2/` (echte Versicherer-Briefe) | C4 (Korpus-Belege), A3 (Citation-Bait aus echten Formulierungen) | E-E-A-T Experience, H1 |
| `data/fälle/` (Gutachten, echte Fälle, Werte) | C4 (anonymisierte Beleg-Blocks), C3 (Rechner-Beispiele mit echten Werten, z.B. MFM aus Fall_12) | E-E-A-T, H5 Statistics |
| `research/Pillar-A-psyche` + `behavior/B11-trauma` | Tonalität + die „8 inneren Fragen" (Doc 13 §0) als FAQ-Targeting | H4 Q&A |
| `research/Pillar-B-Haftpflicht` | juristische Substanz (in 57 Spokes ✓; speist C1/C2) | H3 Authority |
| `research/Pillar-C-Technik` | C3 (E-Auto-Wertverlust), Tesla-Content | H5 |
| `workshops/synthesis/personas` + `kunden-fragen` | answer-first FAQ-Phrasierung (Sub-Sentence-Match) | H1, H4 |
| `workshops/synthesis/customer-journey-keyword-map` | Keyword-Targeting C1–C3 | Research-Phase |

---

## 4 · Priorisierte Workstreams (claimondo.de, buildbar)

| WS | Inhalt | Aufwand | Wirkung | Hebel | DoD |
|---|---|---|---|---|---|
| **W1 — Quick Wins auf Bestand** | A1 (Snippet im Body) + A2 (citation[]) + B3 (Freshness) + B4 (IndexNow) | niedrig | hoch (sofort, Live-Retrieval) | Doc 29 H1/H3/H7 + seo-geo Multi-Engine | Snippet 2× im HTML; citation[] befüllt + schema.org-validiert; dateModified live; IndexNow-Ping bei Deploy; Build+token-audit grün |
| **W2 — Authority-Backbone** | B1 (Author/Cluster-Schema) + B2 (brand-facts) + C5 (/team) | mittel | hoch | Doc 13 §6/§4, E-E-A-T | parentOrganization + Kevin Person + LexDrive LegalService im Schema; brand-facts.ts + check-script; /team mit Person-Schema; Authority-Prompts #24–26 im Probe-Test verbessert |
| **W3 — Content-USP** | C4 (Korpus-Belege) + A3 (Citation-Bait) + C1 (Comparison) + C2 (his-eintrag) | mittel | sehr hoch | E-E-A-T Experience, H1 | DSGVO-Review (Kevin) bestanden; Comparison-Cluster live; his-eintrag-Page live (First-Mover) |
| **W4 — Tools** | C3 (3 Rechner) | hoch | hoch | Tool = Citation-Magnet | Rechner live + JSON-LD; mobil; < 3 s |
| **W5 — Mess-Infra** | B6 (Visibility-Probe) + B5 (PDF-Export) | mittel | mittel (misst/erweitert) | Doc 13 §12, Perplexity-PDF | Probe-Script läuft 30 Prompts × Engines → Markdown-Report; PDF-Export Cornerstones+Report |

---

## 5 · Empfohlene erste Build-Batch

**W1 zuerst** — niedrigster Aufwand, nutzt 100 % die gerade gebaute Infra, vier Hebel auf einmal, sofortige Live-Retrieval-Wirkung. **Plus W2-B1 (Author-Schema)** als wirkungsvollste Einzelmaßnahme (Authority).

→ Erste PR-Schnitt-Empfehlung: **W1 (A1+A2+B3+B4) + B1**. Build-/token-audit-Gate + AI-Visibility-Baseline (B6 vorab als Mess-Nullpunkt).

---

## 6 · Erfolgsmetriken (aus Doc 13 §12 / execution-plan)

- **GEO-Score ≥ 75** pro optimierter Seite (CORE-EEAT-Gate).
- Citation in **≥ 5 Tier-1-Terms** in ChatGPT/Perplexity binnen 3–6 Monaten.
- AI-Visibility-Trajektorie via **B6**: Baseline (Tag 0) → Tag 30 → 60 → 90, gegen die 30 Test-Prompts (Doc 13 §8).
- Messung ist Teil des Plans (B6), nicht nachgelagert.

---

## 7 · Offene Entscheidungen (für Aaron-Review)

1. **A1 Snippet-Doppelung** — UX (einmal, sauber) vs GEO (zweimal, mehr Citations)? Empfehlung: GEO (zweimal).
2. **C4 DSGVO** — Korpus-Belege nur pseudonymisiert; braucht Kevin-Freigabe pro Beleg. OK als Gate?
3. **Branch-/PR-Schnitt** — alles in einer PR oder W1/W2/W3… als Serie? Empfehlung: W1+B1 als erste PR, Rest sequenziell.
4. **B4 IndexNow** — bestätigen, dass Bing/Brave-Submission gewünscht ist (kleiner ENV-Key-Bedarf).
