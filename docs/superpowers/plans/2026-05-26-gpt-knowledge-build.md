# GPT-Knowledge-Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein deterministisches Node-Skript `scripts/build-gpt-knowledge.mjs` baut 6 thematische Markdown-Knowledge-Bundles aus `marketing-strategy/research/` und schreibt sie privat (gitignored) nach `marketing-strategy/gpt-knowledge/` für den manuellen Upload in den ChatGPT Custom GPT.

**Architecture:** Reines ESM, nur `node:`-Builtins (keine Deps). Alle Logik in exportierten Pure-ish-Funktionen (`stripFrontmatter`, `listMarkdown`, `sourceBlock`, `bundles`, `buildBundle`, `parseArgs`, `main`); `main()` wirft statt `process.exit` (testbar), der Run-Guard am Dateiende übersetzt das in einen Exit-Code. Tests via `node --test` (Builtin) → laufen ohne `node_modules`.

**Tech Stack:** Node 24 ESM, `node:fs`/`node:path`/`node:url`, `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-05-26-gpt-knowledge-build-design.md` · Quelle: `marketing-strategy/research/mcp/geo-gpt-knowledge-strategy-2026-05-26.md`

**Bundle-Mapping (Soll, 6 Files):**
1. `claimondo-decoder-versicherer-kuerzungen.md` ← `versicherer-briefe.md` + `Pillar-B-Haftpflicht/H8.*-decoder-*.md`
2. `claimondo-bgh-bgb-juris-referenz.md` ← `bgh-urteile.md` + `bgb-paragraphen.md`
3. `claimondo-praxis-quotes-faelle.md` ← `kevin-praxis-notes.md`
4. `claimondo-zahlen-tabellen-spannen.md` ← `bvsk-honorartabelle.md` + `gdv-statistik.md` + `nutzungsausfall-mietwagen.md` + `schmerzensgeld.md` + `sf-klassen-rueckstufung.md` + `rvg-anwaltskosten.md`
5. `claimondo-sv-technik-pruefdienste.md` ← `Pillar-C-Technik/*.md`
6. `claimondo-haftpflicht-recht.md` ← `Pillar-B-Haftpflicht/H1.*–H7.*.md` (exkl. H8)

**Note on commits:** TDD-Mikro-Commits nutzen kurze Messages mit Kurz-Audit-Footer. Der finale PR (gegen `staging`) trägt den vollen 7-Punkte-Audit (AGENTS.md §post-task-audit). Output-Files sind gitignored → werden nie committet.

---

## File Structure

- **Create:** `scripts/build-gpt-knowledge.mjs` — der komplette Builder (Helfer + manifest + `main` + Run-Guard).
- **Create:** `scripts/build-gpt-knowledge.test.mjs` — `node --test`-Suite mit Temp-Fixtures.
- **Generated (gitignored, nicht committen):** `marketing-strategy/gpt-knowledge/*.md`.

---

## Task 1: Pure-Helfer (Frontmatter-Strip, Dedupe, Natural-Sort)

**Files:**
- Create: `scripts/build-gpt-knowledge.mjs`
- Test: `scripts/build-gpt-knowledge.test.mjs`

- [ ] **Step 1: Failing test schreiben** — `scripts/build-gpt-knowledge.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  stripFrontmatter, isDuplicateCopy, naturalCompare,
} from './build-gpt-knowledge.mjs'

test('stripFrontmatter entfernt führenden ----Block', () => {
  assert.equal(stripFrontmatter('---\na: 1\n---\nBODY'), 'BODY')
  assert.equal(stripFrontmatter('---\r\na: 1\r\n---\r\nBODY'), 'BODY')
  assert.equal(stripFrontmatter('kein frontmatter'), 'kein frontmatter')
})

test('isDuplicateCopy erkennt " (1).md"-Kopien', () => {
  assert.equal(isDuplicateCopy('H6.10-wenden (1).md'), true)
  assert.equal(isDuplicateCopy('H6.10-wenden.md'), false)
})

test('naturalCompare sortiert H8.2 vor H8.10', () => {
  assert.deepEqual(['H8.10.md', 'H8.2.md'].sort(naturalCompare), ['H8.2.md', 'H8.10.md'])
})
```

- [ ] **Step 2: Test laufen, Fail bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: FAIL — `Cannot find module './build-gpt-knowledge.mjs'` (Datei existiert noch nicht).

- [ ] **Step 3: Minimal-Implementierung** — `scripts/build-gpt-knowledge.mjs` anlegen:

```js
#!/usr/bin/env node
// Baut thematische GPT-Knowledge-Bundles aus marketing-strategy/research/ fuer den
// ChatGPT Custom GPT "Claimondo - Kfz-Schaden & Gutachter-Finder".
// Output ist PRIVAT: marketing-strategy/gpt-knowledge/ (gitignored), kein Web-Serving.
//
// Usage:
//   node scripts/build-gpt-knowledge.mjs [--input <dir>] [--out <dir>] [--author "<name>"] [--strict]
//
// Spec: docs/superpowers/specs/2026-05-26-gpt-knowledge-build-design.md

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DEFAULT_INPUT = 'marketing-strategy/research'
export const DEFAULT_OUT = 'marketing-strategy/gpt-knowledge'
export const DEFAULT_AUTHOR = 'Aaron Sprafke'

/** Entfernt einen fuehrenden YAML-Frontmatter-Block (--- ... ---). */
export function stripFrontmatter(md) {
  const m = /^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md)
  return m ? md.slice(m[0].length).replace(/^\s+/, '') : md
}

/** Versehentliche Kopie wie "H6.10-wenden (1).md"? */
export function isDuplicateCopy(name) {
  return / \(\d+\)\.md$/i.test(name)
}

/** Numerisch-bewusster Vergleich, damit H8.2 < H8.10. */
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
```

- [ ] **Step 4: Test laufen, Pass bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: PASS — 3 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-gpt-knowledge.mjs scripts/build-gpt-knowledge.test.mjs
git commit -m "feat(gpt-knowledge): pure helpers (frontmatter strip, dedupe, natural sort)

Audit: Build n/a (.mjs, kein Next-Pfad) · Tests: node --test gruen · kein UI/Regression"
```

---

## Task 2: `listMarkdown` + `sourceBlock` (Filesystem + Provenance)

**Files:**
- Modify: `scripts/build-gpt-knowledge.mjs`
- Test: `scripts/build-gpt-knowledge.test.mjs`

- [ ] **Step 1: Failing tests + Fixture-Helper ergänzen** — am Anfang der Testdatei die Imports erweitern und den Fixture-Helper + Tests hinzufügen:

```js
// Imports oben ergaenzen:
import { mkdtempSync, mkdirSync, writeFileSync as wf, existsSync as ex, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pjoin } from 'node:path'
import { listMarkdown, sourceBlock } from './build-gpt-knowledge.mjs'

function makeFixture() {
  const root = mkdtempSync(pjoin(tmpdir(), 'gptk-'))
  const research = pjoin(root, 'research')
  const pb = pjoin(research, 'Pillar-B-Haftpflicht')
  const pc = pjoin(research, 'Pillar-C-Technik')
  mkdirSync(pb, { recursive: true })
  mkdirSync(pc, { recursive: true })
  wf(pjoin(research, 'versicherer-briefe.md'), '---\ntitle: x\n---\nBRIEF-BODY')
  wf(pjoin(research, 'bgh-urteile.md'), 'BGH-BODY')
  wf(pjoin(research, 'bgb-paragraphen.md'), 'BGB-BODY')
  wf(pjoin(research, 'kevin-praxis-notes.md'), 'KEVIN-BODY')
  wf(pjoin(research, 'bvsk-honorartabelle.md'), 'BVSK-BODY')
  wf(pjoin(research, 'gdv-statistik.md'), 'GDV-BODY')
  wf(pjoin(research, 'nutzungsausfall-mietwagen.md'), 'NUTZ-BODY')
  wf(pjoin(research, 'schmerzensgeld.md'), 'SCHMERZ-BODY')
  wf(pjoin(research, 'sf-klassen-rueckstufung.md'), 'SF-BODY')
  wf(pjoin(research, 'rvg-anwaltskosten.md'), 'RVG-BODY')
  wf(pjoin(pb, 'H8.10-decoder-nut.md'), 'D10')
  wf(pjoin(pb, 'H8.2-decoder-mitv.md'), 'D2')
  wf(pjoin(pb, 'H8.2-decoder-mitv (1).md'), 'DUP')
  wf(pjoin(pb, 'H1.1-betriebsgefahr.md'), 'H11')
  wf(pjoin(pb, 'H7.9-kasko.md'), 'H79')
  wf(pjoin(pc, 'C-GE.1-bvsk.md'), 'C1')
  wf(pjoin(pc, 'C-GE.2-dekra.md'), 'C2')
  return { root, research, pb, pc }
}

test('listMarkdown filtert, dedupt, natural-sortiert', () => {
  const { pb } = makeFixture()
  const h8 = listMarkdown(pb, (f) => /^H8\.\d+-decoder-/i.test(f)).map((p) => p.split(/[\\/]/).pop())
  assert.deepEqual(h8, ['H8.2-decoder-mitv.md', 'H8.10-decoder-nut.md'])
})

test('listMarkdown gibt [] fuer fehlendes Verzeichnis', () => {
  assert.deepEqual(listMarkdown(pjoin(tmpdir(), 'nope-xyz-dir')), [])
})

test('sourceBlock: Provenance-Marker + Frontmatter gestrippt', () => {
  const { research } = makeFixture()
  const { block, missing } = sourceBlock(pjoin(research, 'versicherer-briefe.md'))
  assert.equal(missing, false)
  assert.match(block, /<!-- source: .*versicherer-briefe\.md -->/)
  assert.match(block, /## versicherer-briefe/)
  assert.match(block, /BRIEF-BODY/)
  assert.equal(block.includes('title: x'), false)
})

test('sourceBlock meldet fehlende Datei', () => {
  const r = sourceBlock(pjoin(tmpdir(), 'does-not-exist-xyz.md'))
  assert.equal(r.missing, true)
  assert.equal(r.block, '')
})
```

- [ ] **Step 2: Test laufen, Fail bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: FAIL — `listMarkdown`/`sourceBlock` nicht exportiert.

- [ ] **Step 3: Implementierung** — in `scripts/build-gpt-knowledge.mjs` nach `naturalCompare` ergänzen:

```js
/** Listet .md in dir (optional gefiltert), dedupt Kopien, natural-sortiert. */
export function listMarkdown(dir, predicate = () => true) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !isDuplicateCopy(f) && predicate(f))
    .sort(naturalCompare)
    .map((f) => join(dir, f))
}

/** Ein provenance-umrahmter Quell-Block. Gibt { block, missing } zurueck. */
export function sourceBlock(path) {
  if (!existsSync(path)) return { block: '', missing: true }
  const slug = basename(path).replace(/\.md$/, '')
  const body = stripFrontmatter(readFileSync(path, 'utf-8')).trim()
  return { block: `\n\n---\n\n<!-- source: ${path} -->\n\n## ${slug}\n\n${body}\n`, missing: false }
}
```

- [ ] **Step 4: Test laufen, Pass bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: PASS — alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-gpt-knowledge.mjs scripts/build-gpt-knowledge.test.mjs
git commit -m "feat(gpt-knowledge): listMarkdown + sourceBlock (provenance, missing-handling)

Audit: Build n/a · Tests: node --test gruen · kein UI/Regression"
```

---

## Task 3: Manifest (`bundles`) + `header` + `buildBundle`

**Files:**
- Modify: `scripts/build-gpt-knowledge.mjs`
- Test: `scripts/build-gpt-knowledge.test.mjs`

- [ ] **Step 1: Failing tests ergänzen**:

```js
import { bundles, buildBundle, header } from './build-gpt-knowledge.mjs'

test('bundles definiert genau 6 Files mit erwarteten Quellen', () => {
  const { research } = makeFixture()
  const b = bundles(research)
  assert.equal(Object.keys(b).length, 6)
  // #1: versicherer-briefe + 2 H8 (Dup entfernt)
  assert.equal(b['claimondo-decoder-versicherer-kuerzungen.md'].sources.length, 3)
  // #4: 6 Zahlen-Quellen
  assert.equal(b['claimondo-zahlen-tabellen-spannen.md'].sources.length, 6)
  // #6: nur H1-H7, kein H8
  const recht = b['claimondo-haftpflicht-recht.md'].sources.map((p) => p.split(/[\\/]/).pop())
  assert.deepEqual(recht, ['H1.1-betriebsgefahr.md', 'H7.9-kasko.md'])
})

test('buildBundle baut Header + Bloecke, trackt missing', () => {
  const { research } = makeFixture()
  const def = bundles(research)['claimondo-bgh-bgb-juris-referenz.md']
  const { content, missing } = buildBundle(def, '2026-05-26', 'Aaron Sprafke')
  assert.match(content, /# Claimondo Knowledge —/)
  assert.match(content, /\*\*Stand:\*\* 2026-05-26/)
  assert.match(content, /\*\*Verantwortlich:\*\* Aaron Sprafke/)
  assert.match(content, /BGH-BODY/)
  assert.match(content, /BGB-BODY/)
  assert.equal(missing.length, 0)
})

test('buildBundle sammelt fehlende Quellen', () => {
  const { research } = makeFixture()
  unlinkSync(pjoin(research, 'bgh-urteile.md'))
  const def = bundles(research)['claimondo-bgh-bgb-juris-referenz.md']
  const { missing } = buildBundle(def, '2026-05-26', 'Aaron Sprafke')
  assert.equal(missing.length, 1)
  assert.match(missing[0], /bgh-urteile\.md/)
})
```

- [ ] **Step 2: Test laufen, Fail bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: FAIL — `bundles`/`buildBundle`/`header` nicht exportiert.

- [ ] **Step 3: Implementierung** — in `scripts/build-gpt-knowledge.mjs` ergänzen:

```js
/** Header-Block fuer ein Bundle. */
export function header(title, sourceCount, today, author) {
  return `# Claimondo Knowledge — ${title}

> Auto-generiert aus \`marketing-strategy/research/\` via \`scripts/build-gpt-knowledge.mjs\`.
> Quelle der Strategie: \`marketing-strategy/research/mcp/geo-gpt-knowledge-strategy-2026-05-26.md\`.
> **Verantwortlich:** ${author} · **Stand:** ${today} · **Quell-Files:** ${sourceCount}
> Interne Wissens-Basis fuer den ChatGPT Custom GPT „Claimondo - Kfz-Schaden & Gutachter-Finder". Nicht fuer woertliche Publikation (Werte teils illustrativ, vor Veroeffentlichung pruefen).
`
}

/** Bundle-Manifest. Loest readdir-basierte Globs gegen inputDir auf. */
export function bundles(inputDir) {
  const pb = join(inputDir, 'Pillar-B-Haftpflicht')
  const pc = join(inputDir, 'Pillar-C-Technik')
  const f = (name) => join(inputDir, name)
  return {
    'claimondo-decoder-versicherer-kuerzungen.md': {
      title: 'Versicherer-Kuerzungs-Decoder',
      sources: [f('versicherer-briefe.md'), ...listMarkdown(pb, (n) => /^H8\.\d+-decoder-/i.test(n))],
    },
    'claimondo-bgh-bgb-juris-referenz.md': {
      title: 'BGH-Urteile + BGB-Paragraphen (Anti-Halluzinations-Anker)',
      sources: [f('bgh-urteile.md'), f('bgb-paragraphen.md')],
    },
    'claimondo-praxis-quotes-faelle.md': {
      title: 'Praxis-Quotes + Top-Fehler-Liste',
      sources: [f('kevin-praxis-notes.md')],
    },
    'claimondo-zahlen-tabellen-spannen.md': {
      title: 'Zahlen, Tabellen, Spannen',
      sources: [
        f('bvsk-honorartabelle.md'), f('gdv-statistik.md'), f('nutzungsausfall-mietwagen.md'),
        f('schmerzensgeld.md'), f('sf-klassen-rueckstufung.md'), f('rvg-anwaltskosten.md'),
      ],
    },
    'claimondo-sv-technik-pruefdienste.md': {
      title: 'Sachverstaendigen-Landschaft + Pruefdienste',
      sources: listMarkdown(pc),
    },
    'claimondo-haftpflicht-recht.md': {
      title: 'Haftpflicht-Recht (Grundlagen, Schadenspositionen, Fristen, Unfalltypen)',
      sources: listMarkdown(pb, (n) => /^H[1-7]\./i.test(n)),
    },
  }
}

/** Baut ein Bundle → { content, missing: string[] }. */
export function buildBundle(def, today, author) {
  const missing = []
  let body = ''
  for (const path of def.sources) {
    const { block, missing: isMissing } = sourceBlock(path)
    if (isMissing) missing.push(path)
    else body += block
  }
  return { content: header(def.title, def.sources.length, today, author) + body, missing }
}
```

- [ ] **Step 4: Test laufen, Pass bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-gpt-knowledge.mjs scripts/build-gpt-knowledge.test.mjs
git commit -m "feat(gpt-knowledge): 6-bundle manifest + header + buildBundle

Audit: Build n/a · Tests: node --test gruen · kein UI/Regression"
```

---

## Task 4: `parseArgs` + `main` + Run-Guard

**Files:**
- Modify: `scripts/build-gpt-knowledge.mjs`
- Test: `scripts/build-gpt-knowledge.test.mjs`

- [ ] **Step 1: Failing tests ergänzen**:

```js
import { parseArgs, main, DEFAULT_INPUT, DEFAULT_OUT, DEFAULT_AUTHOR } from './build-gpt-knowledge.mjs'

test('parseArgs liest Flags mit Defaults', () => {
  assert.deepEqual(parseArgs([]), { input: DEFAULT_INPUT, out: DEFAULT_OUT, author: DEFAULT_AUTHOR, strict: false })
  assert.deepEqual(parseArgs(['--input', 'a', '--out', 'b', '--author', 'X Y', '--strict']),
    { input: 'a', out: 'b', author: 'X Y', strict: true })
})

test('main schreibt 6 Bundles ins out-Verzeichnis', () => {
  const { root, research } = makeFixture()
  const out = pjoin(root, 'gpt-knowledge')
  const summary = main(['--input', research, '--out', out])
  assert.equal(summary.results.length, 6)
  for (const name of Object.keys(bundles(research))) {
    assert.equal(ex(pjoin(out, name)), true, `${name} geschrieben`)
  }
  assert.equal(summary.missing.length, 0)
})

test('main wirft bei fehlendem input-Verzeichnis', () => {
  assert.throws(() => main(['--input', pjoin(tmpdir(), 'nope-xyz'), '--out', pjoin(tmpdir(), 'o')]),
    /Input-Verzeichnis fehlt/)
})

test('main --strict wirft wenn Quelle fehlt', () => {
  const { root, research } = makeFixture()
  unlinkSync(pjoin(research, 'kevin-praxis-notes.md'))
  const out = pjoin(root, 'gpt-knowledge')
  assert.throws(() => main(['--input', research, '--out', out, '--strict']), /fehlen/)
})
```

- [ ] **Step 2: Test laufen, Fail bestätigen**

Run: `node --test scripts/build-gpt-knowledge.test.mjs`
Expected: FAIL — `parseArgs`/`main` nicht exportiert.

- [ ] **Step 3: Implementierung** — in `scripts/build-gpt-knowledge.mjs` ergänzen (Run-Guard ans Dateiende):

```js
/** Parst argv (Array nach dem Skriptnamen). */
export function parseArgs(argv) {
  const opts = { input: DEFAULT_INPUT, out: DEFAULT_OUT, author: DEFAULT_AUTHOR, strict: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--input') opts.input = argv[++i]
    else if (a === '--out') opts.out = argv[++i]
    else if (a === '--author') opts.author = argv[++i]
    else if (a === '--strict') opts.strict = true
  }
  return opts
}

/** Baut alle Bundles. Wirft bei fehlendem input-Root. Gibt Summary zurueck. */
export function main(argv = []) {
  const { input, out, author, strict } = parseArgs(argv)
  if (!existsSync(input)) {
    throw new Error(`Input-Verzeichnis fehlt: ${input} (aus einem Tree mit marketing-strategy/research/ laufen)`)
  }
  if (!existsSync(out)) mkdirSync(out, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const defs = bundles(input)
  const results = []
  const allMissing = []
  for (const [file, def] of Object.entries(defs)) {
    const { content, missing } = buildBundle(def, today, author)
    writeFileSync(join(out, file), content, 'utf-8')
    results.push({ file, bytes: content.length, sources: def.sources.length })
    allMissing.push(...missing)
    console.log(`→ ${file}  ${(content.length / 1024).toFixed(1)} KB  (${def.sources.length} Quellen${missing.length ? `, ⚠ ${missing.length} FEHLT` : ''})`)
  }
  for (const m of allMissing) console.warn(`  ⚠ FEHLT: ${m}`)
  const totalKb = (results.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(0)
  console.log(`\n${results.length} Bundles, ${totalKb} KB total → ${out}/`)
  console.log('Aaron laedt diese Files in ChatGPT-GPT-Builder → Configure → Knowledge.')
  if (strict && allMissing.length) throw new Error(`${allMissing.length} Quell-File(s) fehlen (--strict).`)
  return { results, missing: allMissing, out }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }
}
```

- [ ] **Step 4: Tests + Syntax-Check laufen**

Run: `node --check scripts/build-gpt-knowledge.mjs && node --test scripts/build-gpt-knowledge.test.mjs`
Expected: PASS — `node --check` ohne Output (ok), alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-gpt-knowledge.mjs scripts/build-gpt-knowledge.test.mjs
git commit -m "feat(gpt-knowledge): parseArgs + main + run-guard (throws statt exit, testbar)

Audit: Build n/a · Tests: node --test gruen + node --check ok · kein UI/Regression"
```

---

## Task 5: Integrationslauf gegen echten Research-Content

Der echte `marketing-strategy/research/` liegt im Haupt-Checkout (gitignored, nicht im Worktree). Wir lesen ihn read-only von dort via `--input` (kein Kopieren, kein Trampeln). Output landet im gitignored `marketing-strategy/gpt-knowledge/` des Worktrees.

**Files:** keine neuen (nur Lauf + Verifikation).

- [ ] **Step 1: Builder gegen echten Content laufen**

Run (aus dem Worktree-Root):
```bash
node scripts/build-gpt-knowledge.mjs --strict \
  --input "C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/marketing-strategy/research"
```
Expected: 6 `→`-Zeilen, **keine** `⚠ FEHLT`, Summary `6 Bundles, <NNN> KB total`. `--strict` ⇒ Exit 0 nur wenn keine Quelle fehlt (sonst wird ein falsch geratener/umbenannter Pfad sofort hart sichtbar).

- [ ] **Step 2: Output verifizieren**

Run:
```bash
ls -la marketing-strategy/gpt-knowledge/
head -8 marketing-strategy/gpt-knowledge/claimondo-decoder-versicherer-kuerzungen.md
```
Expected: 6 `.md`-Files; Header mit `# Claimondo Knowledge —`, `Stand:`-Datum, `Verantwortlich: Aaron Sprafke`. Plausible Größen (≈ #1 250 KB, #2 150 KB, #3 80 KB, #4 ~180 KB, #5 200 KB, #6 neu/groß).

- [ ] **Step 3: Bestätigen, dass Output gitignored ist (kein versehentliches Tracking)**

Run: `git status --short`
Expected: nur `scripts/`-Änderungen (bereits committed) — **keine** `marketing-strategy/gpt-knowledge/`-Einträge. Falls doch sichtbar: Build abbrechen, `.gitignore` prüfen (Regel `marketing-strategy/` muss greifen).

- [ ] **Step 4: Commit (nur falls noch uncommittete Skript-Änderungen)**

```bash
git add scripts/build-gpt-knowledge.mjs scripts/build-gpt-knowledge.test.mjs
git commit -m "test(gpt-knowledge): integration run green against real research (6 bundles, 0 FEHLT)" || echo "nichts zu committen"
```

---

## Task 6: Handoff-Notiz für Aaron

**Files:**
- Create: `docs/superpowers/specs/2026-05-26-gpt-knowledge-handoff.md`

- [ ] **Step 1: Handoff schreiben** — `docs/superpowers/specs/2026-05-26-gpt-knowledge-handoff.md`:

```markdown
# GPT-Knowledge — Aaron-Handoff

**Build:** `node scripts/build-gpt-knowledge.mjs` (aus Haupt-Checkout, wo `marketing-strategy/research/` liegt).
Output: `marketing-strategy/gpt-knowledge/*.md` (gitignored, lokal).

## Upload (ChatGPT GPT-Builder)
1. chatgpt.com/gpts/editor → GPT „Claimondo — Kfz-Schaden & Gutachter-Finder" bearbeiten.
2. Configure → Knowledge. Altes Knowledge ggf. löschen.
3. Die 6 Bundles aus `marketing-strategy/gpt-knowledge/` hochladen (optional zusätzlich ein `llms-full.txt`-Snapshot, s.u.).
4. Speichern → Update.

## llms-full.txt-Snapshot (optional, unabhängig)
Prüfen: `curl -sL -o /dev/null -w "HTTP %{http_code} | %{size_download} bytes\n" https://claimondo.de/llms-full.txt` (Erwartung HTTP 200, >100k).
Falls als Knowledge-File gewünscht: Inhalt lokal sichern und mit hochladen.

## Smoke-Prompts im GPT-Preview
- „Die HUK kürzt mir die Wertminderung auf 0 €, was kann ich tun?" → BGH-Verweis + Decoder + SV-CTA.
- „Was kostet ein Kfz-Gutachter in München?" → BVSK-Spanne + § 249 BGB.
- „Ist DEKRA ein unabhängiger Gutachter?" → BVSK/DEKRA/GTÜ/öbuv-Aufdröselung + freier-SV-Empfehlung.
- „Häufigste Fehler nach einem Unfall?" → Top-Fehler-Liste aus Kevin-Praxis.

## Re-Generation
Output ist privat/gitignored → kein CI-Commit. Bei Research-Änderungen Skript erneut laufen + im GPT-Builder neu hochladen (ChatGPT pullt nicht automatisch).
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-26-gpt-knowledge-handoff.md
git commit -m "docs(gpt-knowledge): Aaron-Handoff (Build, Upload, Smoke-Prompts)

Audit: Build n/a (docs) · kein UI/Regression"
```

- [ ] **Step 3: Push + Stand melden**

```bash
git push
```
Dann Aaron: Branch-Stand + Hinweis, dass der finale PR (gegen `staging`) den vollen 7-Punkte-Audit trägt und Aaron den GPT-Upload selbst macht.

---

## Self-Review (vom Plan-Autor durchgeführt)

- **Spec-Coverage:** 6 Bundles + Mapping (Task 3) ✓ · privat/gitignored Output + Verifikation (Task 5 Step 3) ✓ · Frontmatter-Strip (Task 1/2) ✓ · Dedupe (Task 1/2) ✓ · Header mit Stand+Verantwortlich (Task 3) ✓ · Error-Handling hard-fail/warn/strict (Task 4) ✓ · TDD via node:test ohne node_modules ✓ · Handoff + Smoke-Prompts (Task 6) ✓ · „Bewusst NICHT gebaut" (public/robots/llms.txt/sitemap) — bleibt korrekt unimplementiert ✓.
- **Placeholder-Scan:** Keine TBD/TODO; jeder Code-Step zeigt vollständigen Code + Run-Command + Expected.
- **Typ-Konsistenz:** `sourceBlock`→`{block,missing}`, `buildBundle`→`{content,missing}`, `main`→`{results,missing,out}` durchgängig; `listMarkdown(dir, predicate)`-Signatur in Task 2 definiert und in Task 3 genutzt; `bundles(inputDir)` einheitlich.
```
