# GEO-P1 AEO-Mess-Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein repeatbarer AEO-Mess-Harness, der den Mai-kompatiblen 15-Query-Satz durch Claude-mit-`web_search` jagt, Claimondos Sichtbarkeit/Zitierung scored und ein datiertes Ergebnis-Doc + Gap-Liste produziert.

**Architecture:** Pure Logik (Extractor/Scorer/Reporter, unit-getestet) getrennt von I/O (Runner/Judge/Orchestrator, per Real-Lauf verifiziert). Der Orchestrator liest eine Query-Config, ruft je Query den Claude-`web_search`-Runner (pause_turn-sicher), extrahiert deterministisch Präsenz/Zitat, lässt einen LLM-Judge die subjektiven Dimensionen scoren, aggregiert und schreibt Markdown.

**Tech Stack:** Node ESM (`.mjs`), `@anthropic-ai/sdk` (bereits Dep), vitest (bereits Dep). Kein neuer Dependency.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-03-geo-p1-aeo-measurement-design.md` (approved).
- **Worktree/Branch:** `.claude/worktrees/geo-content-program`, Branch `kitta/geo-content-program` (off `origin/staging`). ALLE Pfade unten sind relativ zur Worktree-Wurzel.
- **API-Bindung (verbatim, verifiziert 2026-08-03 via `claude-api`-Skill):** web_search-Tool = `{ type: "web_search_20260209", name: "web_search", max_uses: 5 }`. Modell `claude-opus-4-8`. **Kein** `temperature`/`top_p`/`budget_tokens` (400 auf Opus 4.8). **pause_turn** muss behandelt werden (Assistant-Turn zurückpushen + neu senden).
- **Run-Kommando:** `node --env-file=.env.local scripts/geo/measure-aeo.mjs` (lädt `ANTHROPIC_API_KEY`).
- **Test-Kommando:** `npx vitest run <explizite-testdatei>` (explizite Pfade laufen unabhängig von der vitest-`include`-Config).
- **Regel 4:** kein User-Runtime-Surface (reines `scripts/`-Tool) → Prod-Playwright-Smoke **n/a** (im PR vermerken). Verifikation = echter Baseline-Lauf (Task 6).
- **Umlaute:** Ausgabe-Doc + Prompts nutzen echte Umlaute (internes Doc; ASCII wäre erlaubt, wir bleiben sauber).

---

### Task 1: Query-Config + Wettbewerber-Liste

**Files:**
- Create: `scripts/geo/aeo-queries.json`
- Test: `scripts/geo/lib/aeo-config.test.mjs`

**Interfaces:**
- Produces: JSON `{ queries: {id,text,cluster,relevanz}[], competitors: {name,domains}[] }`. Nachfolge-Tasks lesen `config.queries` + `config.competitors`.

- [ ] **Step 1: Failing test schreiben** — `scripts/geo/lib/aeo-config.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync(new URL('../aeo-queries.json', import.meta.url)))

describe('aeo-queries config', () => {
  it('hat genau 15 Queries (10 Tag-0 + 5 Journey)', () => {
    expect(cfg.queries).toHaveLength(15)
  })
  it('jede Query hat id/text/cluster/relevanz', () => {
    for (const q of cfg.queries) {
      expect(typeof q.id).toBe('string')
      expect(q.text.length).toBeGreaterThan(3)
      expect(['awareness', 'consideration', 'decision', 'trust', 'branded']).toContain(q.cluster)
    }
  })
  it('Wettbewerber haben name + domains[]', () => {
    expect(cfg.competitors.length).toBeGreaterThanOrEqual(5)
    for (const c of cfg.competitors) {
      expect(typeof c.name).toBe('string')
      expect(Array.isArray(c.domains)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Test laufen — muss failen** — `npx vitest run scripts/geo/lib/aeo-config.test.mjs` → FAIL (Datei fehlt / Cannot find module `../aeo-queries.json`).

- [ ] **Step 3: Config anlegen** — `scripts/geo/aeo-queries.json`:

```json
{
  "queries": [
    { "id": "t01", "text": "Unfallgutachter Köln finden", "cluster": "decision", "relevanz": "hoch" },
    { "id": "t02", "text": "KFZ-Schaden online regulieren lassen in Deutschland", "cluster": "consideration", "relevanz": "hoch" },
    { "id": "t03", "text": "Versicherung kürzt Gutachten – was tun?", "cluster": "consideration", "relevanz": "hoch" },
    { "id": "t04", "text": "Beste Plattform für Unfallabwicklung nach unverschuldetem Unfall", "cluster": "consideration", "relevanz": "hoch" },
    { "id": "t05", "text": "Was kostet ein KFZ-Gutachter?", "cluster": "awareness", "relevanz": "mittel" },
    { "id": "t06", "text": "Unabhängigen Kfz-Sachverständigen in NRW finden", "cluster": "decision", "relevanz": "hoch" },
    { "id": "t07", "text": "Haftpflichtschaden Gutachten kostenlos für Geschädigte", "cluster": "awareness", "relevanz": "hoch" },
    { "id": "t08", "text": "Wertminderung nach Unfall berechnen", "cluster": "awareness", "relevanz": "mittel" },
    { "id": "t09", "text": "HUK kürzt Gutachten – Erfahrungen", "cluster": "consideration", "relevanz": "mittel" },
    { "id": "t10", "text": "Digitale Schadensregulierung Deutschland Anbieter", "cluster": "consideration", "relevanz": "hoch" },
    { "id": "j01", "text": "Wie finde ich einen unabhängigen Kfz-Sachverständigen?", "cluster": "awareness", "relevanz": "hoch" },
    { "id": "j02", "text": "Vergleich der Gutachter-Vermittlungsportale in Deutschland", "cluster": "consideration", "relevanz": "hoch" },
    { "id": "j03", "text": "Online-Kfz-Gutachten – geht das überhaupt?", "cluster": "consideration", "relevanz": "hoch" },
    { "id": "j04", "text": "Schneller Kfz-Gutachter – wer kommt sofort?", "cluster": "decision", "relevanz": "mittel" },
    { "id": "j05", "text": "Was ist Claimondo?", "cluster": "branded", "relevanz": "hoch" }
  ],
  "competitors": [
    { "name": "ADAC", "domains": ["adac.de"] },
    { "name": "DAT", "domains": ["dat.de"] },
    { "name": "Bußgeldkatalog", "domains": ["bussgeldkatalog.org"] },
    { "name": "Neogutachter", "domains": ["neogutachter.de"] },
    { "name": "Unfallpaten", "domains": ["unfallpaten.de"] },
    { "name": "Unfallgiganten", "domains": ["unfallgiganten.de"] },
    { "name": "TÜV SÜD", "domains": ["tuvsud.com"] },
    { "name": "BVSK", "domains": ["bvsk.de"] },
    { "name": "autohaus.de", "domains": ["autohaus.de"] }
  ]
}
```

- [ ] **Step 4: Wortlaut gegen die Docs verifizieren** — `docs/geo/geo-tag0-2026-05-10.md` (die 10 Tag-0-Fragen) + `docs/geo/geo-messung-2026-05-24.md` (die 5 Journey-Prompts) öffnen; wenn der Original-Wortlaut abweicht, `text` je Query angleichen (Vergleichbarkeit mit der 0/40-Baseline). IDs/cluster bleiben.

- [ ] **Step 5: Test laufen — muss passen** — `npx vitest run scripts/geo/lib/aeo-config.test.mjs` → PASS (3 Tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/geo/aeo-queries.json scripts/geo/lib/aeo-config.test.mjs
git commit -m "feat(geo-p1): AEO-Query-Config (15 Queries + Wettbewerber)"
```

---

### Task 2: Extractor (pure) — Präsenz/Zitat aus der Antwort

**Files:**
- Create: `scripts/geo/lib/aeo-extract.mjs`
- Test: `scripts/geo/lib/aeo-extract.test.mjs`

**Interfaces:**
- Consumes: akkumulierte Assistant-Content-Blöcke (Array aus allen Turns eines Query-Laufs) + `competitors` aus Task 1.
- Produces:
  - `mentionsBrand(text, brand): boolean` — Wort-Grenze, case-insensitiv.
  - `extractQueryResult(content, competitors): { claimondo_present, claimondo_cited, claimondo_retrieved, competitors_present: string[], competitors_cited: string[], no_web_result, answer_text }`.

- [ ] **Step 1: Failing test schreiben** — `scripts/geo/lib/aeo-extract.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { mentionsBrand, extractQueryResult } from './aeo-extract.mjs'

const COMPETITORS = [{ name: 'ADAC', domains: ['adac.de'] }, { name: 'DAT', domains: ['dat.de'] }]

// Minimaler Content-Fixture-Builder (spiegelt die web_search-Response-Blöcke)
const text = (t, citations = []) => ({ type: 'text', text: t, citations })
const searchResult = (urls) => ({ type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', url, title: url })) })
const cite = (url) => ({ type: 'web_search_result_location', url, title: url })

describe('mentionsBrand', () => {
  it('matcht claimondo case-insensitiv mit Wort-Grenze', () => {
    expect(mentionsBrand('Nutze Claimondo dafür.', 'claimondo')).toBe(true)
    expect(mentionsBrand('siehe claimondo.de', 'claimondo')).toBe(true)
  })
  it('matcht NICHT den Klimondo-Tippfehler (Halluzination)', () => {
    expect(mentionsBrand('Die Firma Klimondo bietet...', 'claimondo')).toBe(false)
  })
})

describe('extractQueryResult', () => {
  it('präsent + zitiert, wenn claimondo im Text UND in den Citations', () => {
    const content = [searchResult(['https://claimondo.de/kfz-gutachter/koeln']), text('Claimondo vermittelt Gutachter.', [cite('https://claimondo.de/kfz-gutachter/koeln')])]
    const r = extractQueryResult(content, COMPETITORS)
    expect(r.claimondo_present).toBe(true)
    expect(r.claimondo_cited).toBe(true)
    expect(r.claimondo_retrieved).toBe(true)
    expect(r.no_web_result).toBe(false)
  })
  it('retrieved aber nicht cited: in Suchtreffern, aber nicht attribuiert', () => {
    const content = [searchResult(['https://claimondo.de/x', 'https://adac.de/y']), text('Der ADAC hilft.', [cite('https://adac.de/y')])]
    const r = extractQueryResult(content, COMPETITORS)
    expect(r.claimondo_retrieved).toBe(true)
    expect(r.claimondo_cited).toBe(false)
    expect(r.claimondo_present).toBe(false)
    expect(r.competitors_present).toContain('ADAC')
    expect(r.competitors_cited).toContain('ADAC')
  })
  it('no_web_result, wenn keine Treffer/Citations', () => {
    const r = extractQueryResult([text('Ich weiß es nicht.')], COMPETITORS)
    expect(r.no_web_result).toBe(true)
    expect(r.claimondo_present).toBe(false)
  })
  it('ist robust gegen null/kaputte Blöcke', () => {
    const r = extractQueryResult([null, { type: 'text' }, { type: 'web_search_tool_result' }], COMPETITORS)
    expect(r.claimondo_present).toBe(false)
    expect(r.answer_text).toBe('')
  })
})
```

- [ ] **Step 2: Test laufen — muss failen** — `npx vitest run scripts/geo/lib/aeo-extract.test.mjs` → FAIL (Cannot find module `./aeo-extract.mjs`).

- [ ] **Step 3: Extractor implementieren** — `scripts/geo/lib/aeo-extract.mjs`:

```js
// Pure, deterministisch: leitet aus den akkumulierten Antwort-Blöcken die
// objektiven Signale ab. KEINE Modell-Bewertung (die macht der Judge).

export const CLAIMONDO_DOMAINS = ['claimondo.de', 'app.claimondo.de', 'autounfall.io']

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Wort-Grenze + case-insensitiv. "Klimondo" matcht NICHT "claimondo".
export function mentionsBrand(text, brand) {
  if (!text) return false
  return new RegExp(`\\b${escapeRegex(brand)}\\b`, 'i').test(text)
}

export function answerText(content) {
  return (content ?? [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

// Defensiver Walk: Retrieved-URLs (web_search_tool_result) + Cited-URLs (text.citations).
export function collectUrls(content) {
  const retrieved = []
  const cited = []
  for (const block of content ?? []) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r && typeof r.url === 'string') retrieved.push(r.url)
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c && typeof c.url === 'string') cited.push(c.url)
    }
  }
  return { retrieved, cited }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function domainHit(urls, domains) {
  return urls.some((u) => {
    const host = hostOf(u)
    if (!host) return false
    return domains.some((d) => host === d || host.endsWith('.' + d))
  })
}

export function extractQueryResult(content, competitors) {
  const answer_text = answerText(content)
  const { retrieved, cited } = collectUrls(content)
  const competitors_present = competitors.filter((c) => mentionsBrand(answer_text, c.name)).map((c) => c.name)
  const competitors_cited = competitors
    .filter((c) => domainHit(cited, c.domains) || domainHit(retrieved, c.domains))
    .map((c) => c.name)
  return {
    claimondo_present: mentionsBrand(answer_text, 'claimondo'),
    claimondo_cited: domainHit(cited, CLAIMONDO_DOMAINS),
    claimondo_retrieved: domainHit(retrieved, CLAIMONDO_DOMAINS),
    competitors_present,
    competitors_cited,
    no_web_result: retrieved.length === 0 && cited.length === 0,
    answer_text,
  }
}
```

- [ ] **Step 4: Test laufen — muss passen** — `npx vitest run scripts/geo/lib/aeo-extract.test.mjs` → PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/geo/lib/aeo-extract.mjs scripts/geo/lib/aeo-extract.test.mjs
git commit -m "feat(geo-p1): deterministischer AEO-Extractor (Praesenz/Zitat, Klimondo-sicher)"
```

---

### Task 3: Scorer (pure) — Aggregat + 6-Dim

**Files:**
- Create: `scripts/geo/lib/aeo-score.mjs`
- Test: `scripts/geo/lib/aeo-score.test.mjs`

**Interfaces:**
- Consumes: `results: { query, extract?, scores?, error? }[]` (aus dem Orchestrator; `extract` = Task-2-Output, `scores` = Judge `{accuracy,sentiment,completeness}` 0–10|null).
- Produces: `scoreRun(results): { total, present_count, cited_count, sov_claimondo, sov_competitors, judge_avg: {accuracy,sentiment,completeness}, lost: query[], won: query[] }`.

- [ ] **Step 1: Failing test schreiben** — `scripts/geo/lib/aeo-score.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { scoreRun } from './aeo-score.mjs'

const mk = (id, present, cited, comps = [], scores = { accuracy: 8, sentiment: 7, completeness: 6 }) => ({
  query: { id, text: id },
  extract: { claimondo_present: present, claimondo_cited: cited, competitors_present: comps, no_web_result: false },
  scores,
})

describe('scoreRun', () => {
  it('zählt Präsenz + Zitate über die Queries', () => {
    const r = scoreRun([mk('a', true, true), mk('b', true, false), mk('c', false, false, ['ADAC'])])
    expect(r.total).toBe(3)
    expect(r.present_count).toBe(2)
    expect(r.cited_count).toBe(1)
  })
  it('listet verlorene Queries (nicht präsent)', () => {
    const r = scoreRun([mk('a', true, true), mk('c', false, false)])
    expect(r.lost.map((q) => q.id)).toEqual(['c'])
    expect(r.won.map((q) => q.id)).toEqual(['a'])
  })
  it('mittelt Judge-Scores nur über nicht-null Werte', () => {
    const r = scoreRun([mk('a', true, true, [], { accuracy: 10, sentiment: 8, completeness: 6 }), mk('b', true, false, [], { accuracy: null, sentiment: null, completeness: null })])
    expect(r.judge_avg.accuracy).toBe(10)
  })
  it('behandelt Error-Queries (kein extract) sicher', () => {
    const r = scoreRun([{ query: { id: 'e', text: 'e' }, error: 'timeout' }])
    expect(r.total).toBe(1)
    expect(r.present_count).toBe(0)
    expect(r.lost.map((q) => q.id)).toEqual(['e'])
  })
})
```

- [ ] **Step 2: Test laufen — muss failen** — `npx vitest run scripts/geo/lib/aeo-score.test.mjs` → FAIL.

- [ ] **Step 3: Scorer implementieren** — `scripts/geo/lib/aeo-score.mjs`:

```js
// Pure Aggregation der Per-Query-Ergebnisse.

function avg(nums) {
  const xs = nums.filter((n) => typeof n === 'number')
  if (xs.length === 0) return null
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
}

export function scoreRun(results) {
  const total = results.length
  const present_count = results.filter((r) => r.extract?.claimondo_present).length
  const cited_count = results.filter((r) => r.extract?.claimondo_cited).length
  const sov_competitors = results.reduce((n, r) => n + (r.extract?.competitors_present?.length ?? 0), 0)
  const won = results.filter((r) => r.extract?.claimondo_present).map((r) => r.query)
  const lost = results.filter((r) => !r.extract?.claimondo_present).map((r) => r.query)
  return {
    total,
    present_count,
    cited_count,
    sov_claimondo: present_count,
    sov_competitors,
    judge_avg: {
      accuracy: avg(results.map((r) => r.scores?.accuracy)),
      sentiment: avg(results.map((r) => r.scores?.sentiment)),
      completeness: avg(results.map((r) => r.scores?.completeness)),
    },
    won,
    lost,
  }
}
```

- [ ] **Step 4: Test laufen — muss passen** — `npx vitest run scripts/geo/lib/aeo-score.test.mjs` → PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/geo/lib/aeo-score.mjs scripts/geo/lib/aeo-score.test.mjs
git commit -m "feat(geo-p1): AEO-Scorer (Aggregat, SoV, gewonnen/verloren)"
```

---

### Task 4: Reporter (pure) — Ergebnis-Markdown

**Files:**
- Create: `scripts/geo/lib/aeo-report.mjs`
- Test: `scripts/geo/lib/aeo-report.test.mjs`

**Interfaces:**
- Consumes: `runDate: string`, `results` (Task-2/Judge), `aggregate` (Task 3).
- Produces: `renderReport({ runDate, results, aggregate }): string` (Markdown).

- [ ] **Step 1: Failing test schreiben** — `scripts/geo/lib/aeo-report.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { renderReport } from './aeo-report.mjs'
import { scoreRun } from './aeo-score.mjs'

const results = [
  { query: { id: 'a', text: 'Frage A' }, extract: { claimondo_present: true, claimondo_cited: true, competitors_present: [], competitors_cited: [], no_web_result: false }, scores: { accuracy: 9, sentiment: 8, completeness: 7 } },
  { query: { id: 'b', text: 'Frage B' }, extract: { claimondo_present: false, claimondo_cited: false, competitors_present: ['ADAC'], competitors_cited: ['ADAC'], no_web_result: false }, scores: { accuracy: 5, sentiment: 5, completeness: 4 } },
]

describe('renderReport', () => {
  const md = renderReport({ runDate: '2026-08-03', results, aggregate: scoreRun(results) })
  it('enthält Datum + Aggregat (X/N)', () => {
    expect(md).toContain('2026-08-03')
    expect(md).toContain('1/2')
  })
  it('enthält eine Tabellenzeile je Query', () => {
    expect(md).toContain('Frage A')
    expect(md).toContain('Frage B')
  })
  it('enthält die Gap-Liste mit der verlorenen Query + Wettbewerbern', () => {
    expect(md).toMatch(/Gap-Liste/i)
    expect(md).toContain('Frage B')
    expect(md).toContain('ADAC')
  })
})
```

- [ ] **Step 2: Test laufen — muss failen** — `npx vitest run scripts/geo/lib/aeo-report.test.mjs` → FAIL.

- [ ] **Step 3: Reporter implementieren** — `scripts/geo/lib/aeo-report.mjs`:

```js
// Pure: Ergebnisse -> Markdown. Deterministisch, keine I/O.

function row(r) {
  if (r.error) return `| ${r.query.id} | ${r.query.text} | ⚠ error | – | – | – |`
  const e = r.extract
  const flag = e.claimondo_cited ? '✅ zitiert' : e.claimondo_present ? '🟡 erwähnt' : e.no_web_result ? '– kein Web-Treffer' : '❌ fehlt'
  const s = r.scores ?? {}
  const comp = e.competitors_present.join(', ') || '–'
  return `| ${r.query.id} | ${r.query.text} | ${flag} | ${comp} | ${s.accuracy ?? '–'}/${s.sentiment ?? '–'}/${s.completeness ?? '–'} |`
}

export function renderReport({ runDate, results, aggregate }) {
  const a = aggregate
  const lines = []
  lines.push(`# AEO-Messung ${runDate}`)
  lines.push('')
  lines.push(`**Engine (automatisiert):** Claude \`claude-opus-4-8\` + \`web_search_20260209\` (Live-Web-Grounding).`)
  lines.push('')
  lines.push('## Aggregat')
  lines.push('')
  lines.push(`- **Präsenz:** ${a.present_count}/${a.total} Queries erwähnen Claimondo`)
  lines.push(`- **Zitiert:** ${a.cited_count}/${a.total} Queries zitieren eine Claimondo-Quelle`)
  lines.push(`- **Share-of-Voice:** Claimondo ${a.sov_claimondo} vs. Wettbewerber-Erwähnungen ${a.sov_competitors}`)
  lines.push(`- **Judge (Ø, 0–10):** Accuracy ${a.judge_avg.accuracy ?? '–'} · Sentiment ${a.judge_avg.sentiment ?? '–'} · Completeness ${a.judge_avg.completeness ?? '–'}`)
  lines.push(`- **Delta zur Mai-Baseline:** Mai = 0/40 Citations → jetzt Präsenz ${a.present_count}/${a.total}, zitiert ${a.cited_count}/${a.total}.`)
  lines.push('')
  lines.push('## Pro Query')
  lines.push('')
  lines.push('| ID | Query | Claimondo | Wettbewerber (erwähnt) | Judge A/S/C |')
  lines.push('|----|-------|-----------|------------------------|-------------|')
  for (const r of results) lines.push(row(r))
  lines.push('')
  lines.push('## Gap-Liste (verlorene Queries → wahrscheinlicher Fix)')
  lines.push('')
  lines.push('> Fix-Zuordnung ist manuell (Query-Cluster → Content-Typ). Beim Baseline-Lauf ausfüllen.')
  lines.push('')
  for (const q of a.lost) {
    const r = results.find((x) => x.query.id === q.id)
    const comp = r?.extract?.competitors_present?.join(', ') || (r?.error ? `error: ${r.error}` : '–')
    lines.push(`- **${q.text}** → Claimondo fehlt. Stattdessen präsent: ${comp}. Wahrscheinlicher Fix: _(manuell)_`)
  }
  lines.push('')
  lines.push('## Schicht B — Cross-Engine (manuell)')
  lines.push('')
  lines.push('_Google SERP / AI-Overview + ChatGPT/Perplexity/Gemini-Spot-Checks beim Baseline-Lauf eintragen._')
  lines.push('')
  lines.push('## Schicht C — Crawler-Logs (VPS)')
  lines.push('')
  lines.push('_AI-Bot-Hits (GPTBot/ClaudeBot/PerplexityBot/Google-Extended) auf den GEO-Routen beim Baseline-Lauf eintragen._')
  lines.push('')
  return lines.join('\n')
}
```

- [ ] **Step 4: Test laufen — muss passen** — `npx vitest run scripts/geo/lib/aeo-report.test.mjs` → PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/geo/lib/aeo-report.mjs scripts/geo/lib/aeo-report.test.mjs
git commit -m "feat(geo-p1): AEO-Reporter (Ergebnis-Markdown + Gap-Liste)"
```

---

### Task 5: Runner + Judge + Orchestrator (I/O) + 1-Query-Smoke

**Files:**
- Create: `scripts/geo/lib/aeo-run.mjs`, `scripts/geo/lib/aeo-judge.mjs`, `scripts/geo/measure-aeo.mjs`

**Interfaces:**
- Consumes: Task 1 (Config), Task 2 (`extractQueryResult`), Task 3 (`scoreRun`), Task 4 (`renderReport`).
- Produces: `runQuery(text, opts): Promise<Block[]>` (akkumulierter Content), `judge(query, answerText, opts): Promise<{accuracy,sentiment,completeness}>`, und das CLI `measure-aeo.mjs` (`--limit N`).

- [ ] **Step 1: Runner** — `scripts/geo/lib/aeo-run.mjs`:

```js
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }

// Führt EINE Query aus, web_search-grounded. Behandelt pause_turn (Assistant-Turn
// zurückpushen + neu senden) und akkumuliert die Content-Blöcke ALLER Turns
// (Suchtreffer stehen in frühen Turns, die finale Antwort im letzten).
export async function runQuery(text, { model = 'claude-opus-4-8', maxTokens = 4096, maxTurns = 8 } = {}) {
  const messages = [{ role: 'user', content: text }]
  const allContent = []
  for (let turn = 0; turn < maxTurns; turn++) {
    const stream = client.messages.stream({ model, max_tokens: maxTokens, tools: [WEB_SEARCH], messages })
    const msg = await stream.finalMessage()
    allContent.push(...msg.content)
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content })
      continue
    }
    break
  }
  return allContent
}
```

- [ ] **Step 2: Judge** — `scripts/geo/lib/aeo-judge.mjs`:

```js
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM = [
  'Du bewertest, wie gut eine KI-Antwort die Marke "Claimondo" behandelt.',
  'Claimondo (claimondo.de) ist eine unabhängige deutsche Plattform für KFZ-Gutachten & Unfall-Schadenregulierung für unverschuldet Geschädigte.',
  'Antworte AUSSCHLIESSLICH mit JSON, keine Erklärung:',
  '{"accuracy":<0-10>,"sentiment":<0-10>,"completeness":<0-10>}',
  'accuracy = Korrektheit der Aussagen zum Thema/zu Claimondo (10 = korrekt / keine Falschaussage).',
  'sentiment = Ton gegenüber Claimondo (10 = positiv, 5 = neutral oder nicht erwähnt, 0 = negativ).',
  'completeness = wie gut die Antwort die Nutzerintention abdeckt (10 = vollständig).',
].join('\n')

// Extrahiert das erste JSON-Objekt aus einem Text (```json-Fences-tolerant) und validiert 0-10.
export function parseScores(raw) {
  if (!raw) return null
  const m = raw.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let obj
  try {
    obj = JSON.parse(m[0])
  } catch {
    return null
  }
  const ok = (v) => typeof v === 'number' && v >= 0 && v <= 10
  if (!ok(obj.accuracy) || !ok(obj.sentiment) || !ok(obj.completeness)) return null
  return { accuracy: obj.accuracy, sentiment: obj.sentiment, completeness: obj.completeness }
}

export async function judge(query, answerText, { model = 'claude-opus-4-8' } = {}) {
  const user = `Frage: ${query}\n\nKI-Antwort:\n${answerText}\n\nGib nur das JSON.`
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({ model, max_tokens: 300, system: SYSTEM, messages: [{ role: 'user', content: user }] })
    const textOut = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    const parsed = parseScores(textOut)
    if (parsed) return parsed
  }
  return { accuracy: null, sentiment: null, completeness: null }
}
```

- [ ] **Step 3: Mini-Test für `parseScores`** (pure Teil des Judge) — `scripts/geo/lib/aeo-judge.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { parseScores } from './aeo-judge.mjs'

describe('parseScores', () => {
  it('parst blankes JSON', () => {
    expect(parseScores('{"accuracy":8,"sentiment":5,"completeness":7}')).toEqual({ accuracy: 8, sentiment: 5, completeness: 7 })
  })
  it('parst JSON in ```json-Fences mit Prosa drumrum', () => {
    expect(parseScores('Hier:\n```json\n{"accuracy":10,"sentiment":6,"completeness":4}\n```')).toEqual({ accuracy: 10, sentiment: 6, completeness: 4 })
  })
  it('gibt null bei kaputtem/ausserhalb-0-10 JSON', () => {
    expect(parseScores('kein json')).toBeNull()
    expect(parseScores('{"accuracy":99}')).toBeNull()
  })
})
```

Run: `npx vitest run scripts/geo/lib/aeo-judge.test.mjs` → PASS (3 Tests).

- [ ] **Step 4: Orchestrator** — `scripts/geo/measure-aeo.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runQuery } from './lib/aeo-run.mjs'
import { judge } from './lib/aeo-judge.mjs'
import { extractQueryResult } from './lib/aeo-extract.mjs'
import { scoreRun } from './lib/aeo-score.mjs'
import { renderReport } from './lib/aeo-report.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')

function argN(flag, def) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('FEHLER: ANTHROPIC_API_KEY fehlt. Start mit: node --env-file=.env.local scripts/geo/measure-aeo.mjs')
    process.exit(1)
  }
  const cfg = JSON.parse(readFileSync(new URL('./aeo-queries.json', import.meta.url)))
  const limit = argN('--limit', cfg.queries.length)
  const queries = cfg.queries.slice(0, limit)
  const results = []
  for (const q of queries) {
    let content = null
    let err = null
    for (let a = 0; a < 3 && !content; a++) {
      try {
        content = await runQuery(q.text)
      } catch (e) {
        err = e
        console.error(`  retry ${a + 1} für "${q.text}": ${e?.message ?? e}`)
      }
    }
    if (!content) {
      results.push({ query: q, error: String(err?.message ?? err) })
      continue
    }
    const extract = extractQueryResult(content, cfg.competitors)
    const scores = extract.no_web_result
      ? { accuracy: null, sentiment: null, completeness: null }
      : await judge(q.text, extract.answer_text)
    results.push({ query: q, extract, scores })
    console.log(`✓ ${q.id} "${q.text}" — present=${extract.claimondo_present} cited=${extract.claimondo_cited} comps=[${extract.competitors_present.join(',')}]`)
  }
  const aggregate = scoreRun(results)
  const runDate = new Date().toISOString().slice(0, 10)
  const md = renderReport({ runDate, results, aggregate })
  const outDir = resolve(ROOT, 'docs', 'geo', 'measurements')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, `${runDate}-aeo-run.md`)
  writeFileSync(outPath, md, 'utf8')
  console.log(`\nGeschrieben: ${outPath}`)
  console.log(`Präsenz ${aggregate.present_count}/${aggregate.total}, zitiert ${aggregate.cited_count}/${aggregate.total}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 5: 1-Query-Smoke fahren** — `node --env-file=.env.local scripts/geo/measure-aeo.mjs --limit 1` von der Worktree-Wurzel.
Expected: 1 `✓ t01 ...`-Zeile, dann `Geschrieben: .../docs/geo/measurements/2026-08-03-aeo-run.md`. Das Doc öffnen: eine Tabellenzeile, Aggregat, Gap-Liste-Grundgerüst. Wenn `pause_turn`-Warnungen oder leere Antworten: `maxTurns`/`maxTokens` prüfen.

- [ ] **Step 6: Smoke-Doc verwerfen** (der echte Baseline-Lauf ist Task 6) — `git checkout -- docs/geo/measurements/ 2>/dev/null; rm -f docs/geo/measurements/*-aeo-run.md` (nur das ungetrackte Smoke-Doc; noch nichts committed).

- [ ] **Step 7: Commit** (Code, ohne Ergebnis-Doc)

```bash
git add scripts/geo/lib/aeo-run.mjs scripts/geo/lib/aeo-judge.mjs scripts/geo/lib/aeo-judge.test.mjs scripts/geo/measure-aeo.mjs
git commit -m "feat(geo-p1): AEO-Runner (web_search, pause_turn-sicher) + Judge + Orchestrator"
```

---

### Task 6: Baseline-Lauf + Schicht B + C → Ergebnis-Doc

**Files:**
- Create: `docs/geo/measurements/2026-08-03-aeo-run.md` (Output)

**Interfaces:**
- Consumes: den fertigen Harness (Task 5).

- [ ] **Step 1: Vollen Lauf fahren** — `node --env-file=.env.local scripts/geo/measure-aeo.mjs` (alle 15). Erwartung: 15 `✓`-Zeilen (Fehl-Queries als `error`), dann das geschriebene Doc. ~30 API-Calls, wenige Minuten.

- [ ] **Step 2: Gap-Liste manuell ausfüllen** — im Doc je verlorener Query den wahrscheinlichen Fix eintragen (Query-Cluster → Content-Typ, informiert vom Content-Inventar: fehlender Rechner → „interaktiver Rechner"; „Vergleich…" → „vs-/Testsieger-Seite"; „Was ist Claimondo" mit Klimondo-Verwechslung → „sameAs/Wikidata-Entity-Anchoring").

- [ ] **Step 3: Schicht B (Cross-Engine) ergänzen** — für die 15 Queries Google-SERP/AI-Overview via WebSearch prüfen (erscheint claimondo.de? welche Domains dominieren?), Ergebnis in die „Schicht B"-Sektion. ChatGPT/Perplexity/Gemini als manueller Spot-Check vermerken (soweit ohne API-Zugang möglich; sonst als „offen/periodisch" markieren).

- [ ] **Step 4: Schicht C (Crawler-Logs) ergänzen** — VPS-Log-Grep (read-only):

```bash
ssh -i ~/.ssh/claimondo_vps root@212.132.119.110 \
  "grep -hiE 'GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|anthropic-ai|PerplexityBot|Google-Extended' /var/log/nginx/access.log* 2>/dev/null | grep -oiE '(GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|anthropic-ai|PerplexityBot|Google-Extended)' | sort | uniq -c | sort -rn"
```
Ergebnis (Bot × Häufigkeit) in die „Schicht C"-Sektion. Wenn der Log-Pfad abweicht: `ssh ... "ls /var/log/nginx/"` und Pfad anpassen. Wenn 0 Treffer: das explizit vermerken (die Bots crawlen (noch) nicht → eigener Befund).

- [ ] **Step 5: Doc committen**

```bash
git add docs/geo/measurements/2026-08-03-aeo-run.md
git commit -m "docs(geo-p1): AEO-Baseline-Messung 2026-08-03 (Endpoint+Cross-Engine+Logs)"
```

- [ ] **Step 6: Voller Test-Lauf + PR** — `npx vitest run scripts/geo/lib/` (alle 5 Testdateien grün). Dann PR gegen `staging`:

```bash
git push -u origin kitta/geo-content-program
gh pr create --base staging --title "feat(geo-p1): AEO-Mess-Harness + Baseline-Messung" --body "GEO-Programm Tranche 1. Spec + Plan in docs/superpowers. Regel 4: n/a (scripts/-Tool, kein Runtime-Surface); Verifikation = echter Baseline-Lauf (docs/geo/measurements/2026-08-03-aeo-run.md). Gap-Liste priorisiert P3."
```

---

## Self-Review

**1. Spec-Coverage:** Schicht A (Runner/Extractor/Judge/Scorer/Reporter) → Tasks 2–5 ✓. Query-Satz + Rubrik → Task 1 + Reporter ✓. Schicht B/C → Task 6 ✓. Gap-Liste → Reporter + Task-6-Step-2 ✓. Fehlerbehandlung (retry, no_web_result, kein Key) → Runner/Orchestrator/Extractor ✓. Testing (pure Libs) → Tasks 2–5 ✓. Ausgabe-Doc → Task 6 ✓. Kein Cron/UI/Ahrefs (YAGNI) → nicht enthalten ✓.

**2. Placeholder-Scan:** Keine TBD/TODO. Alle Code-Steps vollständig; API-Bindung verbatim; „manuell auszufüllen" (Gap-Liste/Schicht B/C) sind bewusste menschliche Schritte in Task 6, kein Code-Placeholder.

**3. Typ-Konsistenz:** `extractQueryResult`-Output-Felder (`claimondo_present/_cited/_retrieved`, `competitors_present/_cited`, `no_web_result`, `answer_text`) identisch in Extractor (T2), Scorer (T3), Reporter (T4), Orchestrator (T5). `scores`-Shape `{accuracy,sentiment,completeness}` identisch in Judge (T5) + Scorer (T3) + Reporter (T4). `runQuery`/`judge`/`scoreRun`/`renderReport`-Signaturen matchen die Orchestrator-Aufrufe. ✓
