#!/usr/bin/env node
// Baut thematische GPT-Knowledge-Bundles aus marketing-strategy/research/ fuer den
// ChatGPT Custom GPT "Claimondo - Kfz-Schaden & Gutachter-Finder".
// Output ist PRIVAT: marketing-strategy/gpt-knowledge/ (gitignored), kein Web-Serving.
//
// Usage:
//   node scripts/build-gpt-knowledge.mjs [--input <dir>] [--out <dir>] [--author "<name>"] [--strict]
//
// Spec:             docs/superpowers/specs/2026-05-26-gpt-knowledge-build-design.md
// Strategie-Quelle: marketing-strategy/research/mcp/geo-gpt-knowledge-strategy-2026-05-26.md

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DEFAULT_INPUT = 'marketing-strategy/research'
export const DEFAULT_OUT = 'marketing-strategy/gpt-knowledge'
export const DEFAULT_AUTHOR = 'Aaron Sprafke'

/** Entfernt einen fuehrenden YAML-Frontmatter-Block (--- ... ---), inkl. evtl. BOM. */
export function stripFrontmatter(md) {
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)
  return m ? text.slice(m[0].length).replace(/^\s+/, '') : text
}

/** Versehentliche Kopie wie "H6.10-wenden (1).md"? */
export function isDuplicateCopy(name) {
  return / \(\d+\)\.md$/i.test(name)
}

/** Numerisch-bewusster Vergleich, damit H8.2 < H8.10. */
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

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

/** Header-Block fuer ein Bundle (nutzersichtbarer Text: echte Umlaute). */
export function header(title, sourceCount, today, author) {
  return `# Claimondo Knowledge — ${title}

> Auto-generiert aus \`marketing-strategy/research/\` via \`scripts/build-gpt-knowledge.mjs\`.
> Quelle der Strategie: \`marketing-strategy/research/mcp/geo-gpt-knowledge-strategy-2026-05-26.md\`.
> **Verantwortlich:** ${author} · **Stand:** ${today} · **Quell-Files:** ${sourceCount}
> Interne Wissens-Basis für den ChatGPT Custom GPT „Claimondo — Kfz-Schaden & Gutachter-Finder". Nicht für wörtliche Publikation (Werte teils illustrativ, vor Veröffentlichung prüfen).
`
}

/** Bundle-Manifest. Loest readdir-basierte Globs gegen inputDir auf. */
export function bundles(inputDir) {
  const pb = join(inputDir, 'Pillar-B-Haftpflicht')
  const pc = join(inputDir, 'Pillar-C-Technik')
  const f = (name) => join(inputDir, name)
  return {
    'claimondo-decoder-versicherer-kuerzungen.md': {
      title: 'Versicherer-Kürzungs-Decoder',
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
      title: 'Sachverständigen-Landschaft + Prüfdienste',
      sources: listMarkdown(pc),
    },
    'claimondo-haftpflicht-recht.md': {
      title: 'Haftpflicht-Recht (Grundlagen, Schadenspositionen, Fristen, Unfalltypen)',
      sources: listMarkdown(pb, (n) => /^H[1-7]\./i.test(n)),
    },
  }
}

/** Baut ein Bundle. Gibt { content, missing: string[] } zurueck. */
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
    console.log(`-> ${file}  ${(content.length / 1024).toFixed(1)} KB  (${def.sources.length} Quellen${missing.length ? `, FEHLT ${missing.length}` : ''})`)
  }
  for (const m of allMissing) console.warn(`  ! FEHLT: ${m}`)
  const totalKb = (results.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(0)
  console.log(`\n${results.length} Bundles, ${totalKb} KB total -> ${out}/`)
  console.log('Aaron lädt diese Files in ChatGPT-GPT-Builder -> Configure -> Knowledge.')
  if (strict && allMissing.length) throw new Error(`${allMissing.length} Quell-File(s) fehlen (--strict).`)
  return { results, missing: allMissing, out }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    main(process.argv.slice(2))
  } catch (err) {
    console.error(`x ${err.message}`)
    process.exit(1)
  }
}
