# Design: GPT-Knowledge-Build (`scripts/build-gpt-knowledge.mjs`)

**Datum:** 2026-05-26 · **Branch:** `kitta/geo-gpt-knowledge-build` · **Status:** zur Review

## Kontext & Ziel

Build-Skript, das aus dem internen Research-Repo `marketing-strategy/research/` thematische
Mega-Markdown-Files zusammenstellt, die Aaron als **Knowledge** in den ChatGPT Custom GPT
„Claimondo — Kfz-Schaden & Gutachter-Finder" hochlädt. Ziel des GPT: User von „Versicherung
kürzt mir was" zur Conversion (Termin mit unabhängigem SV) führen — mit BGH-belegten Argumenten,
ohne zu halluzinieren.

## Autoritative Quelle

`marketing-strategy/research/mcp/geo-gpt-knowledge-strategy-2026-05-26.md` (gitignored) — die von
Aaron gepostete Vollspec inkl. Referenz-Build-Skript. Dieses Doc ist die **reconcilte** Fassung:
Spec als Basis, plus zwei von Aaron getroffene Entscheidungen, die von der Spec abweichen.

## Getroffene Entscheidungen (Abweichungen von der geposteten Spec)

| Punkt | Gepostete Spec | **Entscheidung (Aaron, 26.05.)** |
|---|---|---|
| **Output-Ziel** | `public/gpt-knowledge/` (web-served) | **`marketing-strategy/gpt-knowledge/` (privat, gitignored)** |
| **File-Anzahl** | 5 Bundles | **6 Bundles** (+ `claimondo-haftpflicht-recht.md`) |
| **Zahlen-Bundle** | nur BVSK + GDV | **+ Nutzungsausfall/Schmerzensgeld/SF/RVG** |

**Begründung Output privat:** Das Research-Repo ist bewusst gitignored (PR #1349) und laut
`research/README.md` teils unfreigegeben (Kevin-Quotes = „Vorlagen, vor Publikation abstimmen")
bzw. urheberrechtlich sensibel (BVSK/Schwacke/Hacks-Wellner: „nie vollständig reproduzieren").
Roh nach `public/` geschrieben (wie das Spec-Skript es tut) läge dieser Content wörtlich öffentlich
unter `claimondo.de/gpt-knowledge/`. Der private GPT-Upload (zu OpenAI) vermeidet das Risiko ganz.
→ **Kein** Sanitizing nötig, **kein** Web-Serving.

## Output: 6 Bundles + Source-Mapping

Alle Quellen aus `marketing-strategy/research/`:

| # | Output-File | Quellen |
|---|---|---|
| 1 | `claimondo-decoder-versicherer-kuerzungen.md` | `versicherer-briefe.md` + `Pillar-B-Haftpflicht/H8.*-decoder-*.md` (10) |
| 2 | `claimondo-bgh-bgb-juris-referenz.md` | `bgh-urteile.md` + `bgb-paragraphen.md` |
| 3 | `claimondo-praxis-quotes-faelle.md` | `kevin-praxis-notes.md` |
| 4 | `claimondo-zahlen-tabellen-spannen.md` | `bvsk-honorartabelle.md` + `gdv-statistik.md` + `nutzungsausfall-mietwagen.md` + `schmerzensgeld.md` + `sf-klassen-rueckstufung.md` + `rvg-anwaltskosten.md` |
| 5 | `claimondo-sv-technik-pruefdienste.md` | `Pillar-C-Technik/*.md` (10) |
| 6 | `claimondo-haftpflicht-recht.md` | `Pillar-B-Haftpflicht/H1.*–H7.*.md` (exkl. H8) |

Bundle-Reihenfolge der Quellen innerhalb eines Files: numerisch sortiert (H8.1 < H8.2 < … < H8.10),
sonst alphabetisch. Pillar-A (Psyche), Hyperlocals, mcp, Workshops bleiben bewusst draußen
(Folge-Backlog laut Spec, falls GPT-Logs es nahelegen).

## Speicherort (verifiziert)

`marketing-strategy/gpt-knowledge/` — durch `.gitignore:119` (`marketing-strategy/`) garantiert
ignoriert (`git check-ignore` bestätigt). Output wird **nie** committet/deployt. Das **Skript**
(`scripts/`) wird committet, der **Output** nicht.

## Build-Mechanik

- **Pure Node-ESM** `scripts/build-gpt-knowledge.mjs`, nur `node:fs`/`node:path`/`node:url` —
  **keine neuen Dependencies** (wie das Spec-Skript).
- **Manifest** = `BUNDLES`-Objekt (aus der Spec, erweitert auf 6 Bundles + erweitertes Zahlen-Bundle).
- **Testbarkeit (Abweichung von der flachen Spec-Vorlage):** in reine Funktionen zerlegen
  (`stripFrontmatter`, `sourceBlock`, `resolveBundleSources`, `buildBundle`, `main`) + Run-Guard
  `if (process.argv[1] === fileURLToPath(import.meta.url)) main()`. Ermöglicht Vitest-Unit-Tests.
- **Frontmatter-Strip (Refinement):** führenden YAML-Block (`---\n…\n---`) jeder Quelle entfernen,
  bevor konkateniert wird (das Spec-Skript dumpt ihn roh). Sauberere Knowledge-Files.
- **Dedupe (Refinement):** Versehentliche Kopien wie `H6.10-wenden (1).md` (Muster ` (\d+)\.md$`)
  überspringen.
- **Header pro File** (Spec-Template + `Verantwortlich: Aaron Sprafke`): Titel, Auto-Gen-Hinweis,
  Strategie-Quelle, `Stand:`-Datum, Quell-File-Count, GPT-Zweck-Absatz (RAG-freundliche H1/H2).
- **Provenance pro Quelle:** `<!-- source: <pfad> -->` + `## <slug>`.
- **Args (optional, mit Defaults):** `--input` (default `marketing-strategy/research`),
  `--out` (default `marketing-strategy/gpt-knowledge`), `--author` (default „Aaron Sprafke"),
  `--strict` (exit 1 bei fehlender Quelle; default aus).

## Error-Handling

- Fehlendes `research/`-Root → **harter Abbruch** (`exit 1`) mit klarer Meldung.
- Einzelne fehlende Quell-Datei → **Warnung** `⚠ FEHLT: <pfad>` + skip (Partial-Build möglich),
  Summary zeigt FEHLT-Count laut. `--strict` macht daraus `exit 1` (für CI/Reviewer-Schutz).
- Am Ende: Build-Summary (pro Bundle KB + Quell-Count, Gesamt, FEHLT-Count).

## Testing (TDD)

- **Vitest-Unit-Tests** mit Temp-Fixture (`node:os` tmpdir): Mini-`research/` mit 2–3 Fake-`.md`
  (eins mit Frontmatter, ein Decoder, eine `(1)`-Kopie). Asserts: Frontmatter gestrippt,
  `<!-- source: -->` vorhanden, Kopie übersprungen, Header hat Datum+Titel, fehlende Quelle → Warnung.
- **Integrationslauf:** echten `marketing-strategy/research/`-Content in den Worktree kopieren
  (dort ebenfalls gitignored), Skript laufen, 6 Files + plausible Größen + **kein** FEHLT prüfen.
- Smoke: Header-Vorhandensein + Quell-Marker je Bundle, Größen grob wie Spec-Schätzung
  (#1 ~250 KB, #2 ~150 KB, #3 ~80 KB, #4 ~150–180 KB durch Erweiterung, #5 ~200 KB, #6 neu).

## Bewusst NICHT gebaut (vs. gepostete Spec — entfällt wegen „privat")

- `public/`-Distribution, `robots.txt`-Check, **5 zusätzliche `llms.txt`-Bullets**, Sitemap-Notiz,
  `curl claimondo.de/gpt-knowledge/…`-DoD-Items, CI-Option die `public/`-Files committet.
- **Beibehalten als Handoff (privatunabhängig):** `llms-full.txt`-Prod-Vorabcheck + GPT-Builder-
  Upload-Anleitung + 4 Smoke-Prompts. Aaron lädt die 6 Bundles + ggf. `llms-full.txt`-Snapshot hoch.

## CI / Re-Generation

Da Output privat/gitignored ist, sind die Spec-Optionen A/B (public committen/cron) gegenstandslos.
→ **Manuell** (`node scripts/build-gpt-knowledge.mjs`) wenn sich Research ändert, danach
GPT-Builder-Re-Upload. Optionaler Folge-Backlog: Auto-Diff-Report beim Re-Build.

## Definition of Done

- [ ] `scripts/build-gpt-knowledge.mjs` existiert, ESM, keine neuen Deps, `node --check` grün.
- [ ] Vitest-Unit-Tests grün.
- [ ] Lauf erzeugt **6 Bundles** in `marketing-strategy/gpt-knowledge/` ohne `⚠ FEHLT`.
- [ ] Jedes Bundle: Auto-Gen-Header mit `Stand`-Datum + `Verantwortlich: Aaron Sprafke`.
- [ ] Frontmatter gestrippt, `(1)`-Kopien übersprungen.
- [ ] Build-Summary zeigt 6 Bundles + Größen + FEHLT-Count.
- [ ] Output-Pfad bleibt gitignored (kein `public/`, kein Commit der `.md`-Outputs).
- [ ] Handoff-Notiz an Aaron (Upload-Schritte + Smoke-Prompts).

## Risiken & Annahmen

- **Source-Pfad-Drift** (Pillar-Struktur ändert sich) → `⚠ FEHLT` + optional `--strict`.
- **Aaron vergisst Re-Upload** → Handoff-Notiz (ChatGPT pullt nicht automatisch).
- **Annahmen:** 6. Bundle heißt `claimondo-haftpflicht-recht.md`; H8-Decoder-Filter
  `^H8\.\d+-decoder-`, H1–H7-Filter `^H[1-7]\.`; `--author` default „Aaron Sprafke".
