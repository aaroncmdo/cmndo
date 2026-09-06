#!/usr/bin/env node
// check-copy-lint.mjs — Copy-Lint ueber die Marketing-Quellen (RDG-Rollentrennung, ASCII-Umlaute,
// Code in Ueberschriften, doppelte Marke im Titel). Reine Quelltext-Pruefung, kein Netz.
//
//   node scripts/check-copy-lint.mjs             -> --warn (exit 0, listet alles)
//   node scripts/check-copy-lint.mjs --ratchet   -> blockt NEUE Verletzer-Files gegen scripts/copy-lint-baseline.json
//   node scripts/check-copy-lint.mjs --update-baseline
//
// Detektoren: scripts/lib/copy-lint-scan.mjs (unit-getestet). Herkunft: Copy-Audit 04.09.2026
// (docs/2026-09-04-copy-audit-marketingseiten.md).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { scanRdg, scanUmlaute, scanTitleBrandTwice, scanAnrede } from './lib/copy-lint-scan.mjs'

const ROOT = process.cwd()
const ROOTS = ['claimondo-marketing', 'autounfall-io', 'kfz-gutachter-koeln', 'kfz-gutachter-duesseldorf', 'kfz-gutachter-bonn', 'kfz-gutachter-aachen', 'kfz-gutachter-wuppertal']
const SUBDIRS = ['app', 'components', 'lib', 'content', 'i18n', 'data', 'config']
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.mdx'])
const SKIP = /node_modules|[\\/]\.next[\\/]|\.test\.|__tests__|\.generated\.ts$|[\\/]public[\\/]|\.d\.ts$/
const BASELINE = join(ROOT, 'scripts', 'copy-lint-baseline.json')
const mode = process.argv.includes('--ratchet') ? 'ratchet' : process.argv.includes('--update-baseline') ? 'update' : 'warn'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (SKIP.test(p)) continue
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (EXT.has(extname(p))) out.push(p)
  }
  return out
}

// Nutzersichtbare Strings je Zeile extrahieren: Literale in TS/TSX (Kommentare gestrippt), JSX-Text,
// JSON-Werte, Markdown-Volltext.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
}
function userStrings(file, src) {
  const ext = extname(file)
  const lines = []
  if (ext === '.md' || ext === '.mdx') { src.split('\n').forEach((l, i) => { if (!/^\s*(import|export|<[A-Za-z])/.test(l)) lines.push([i + 1, l]) }); return lines }
  if (ext === '.json') { src.split('\n').forEach((l, i) => { const m = l.match(/:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$/); if (m) lines.push([i + 1, m[1].replace(/\\"/g, '"')]) }); return lines }
  const s = stripComments(src)
  s.split('\n').forEach((l, i) => {
    const parts = []
    for (const m of l.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) { const v = m[1] ?? m[2] ?? m[3]; if (v && v.length > 12 && /\s/.test(v)) parts.push(v) }
    for (const m of l.matchAll(/>([^<>{}]{12,})</g)) parts.push(m[1])
    if (parts.length) lines.push([i + 1, parts.join(' | ')])
  })
  return lines
}

// Einzeldateien mit nutzersichtbaren Texten ausserhalb der Marketing-Builds: die Blatt-Texte der
// Bildserie "Aus der Patsche" leben als String-Literale im Generator (Abnahme 05.09.: sonst sind die
// Blaetter fuer den Ratchet unsichtbar). Python-Literale werden wie TS/JS-Literale extrahiert.
const EXTRA_FILES = ['docs/marketing/aus-der-patsche/generator.py']
const SCAN_FILES = []
for (const r of ROOTS) for (const sd of SUBDIRS) SCAN_FILES.push(...walk(join(ROOT, r, sd)))
for (const e of EXTRA_FILES) { const p = join(ROOT, e); if (existsSync(p)) SCAN_FILES.push(p) }

const findings = [] // {file, line, code, match}
for (const f of SCAN_FILES) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  let src
  try { src = readFileSync(f, 'utf8') } catch { continue }
  const isI18n = /i18n\/messages\/[a-z]{2}\.json$/.test(rel)
  // `content/claimondo/_translations/<locale>/…` sind die Fremdsprach-Fassungen. Dort ist
  // "du" polnisch, tuerkisch oder russisch — der Anrede-Detektor wuerde fremde Sprachen
  // als deutsches Duzen melden. RDG und Umlaut gelten dort ebenfalls nicht.
  const isUebersetzung = /content\/claimondo\/_translations\//.test(rel)
  const isGerman = (!isI18n || /\/de\.json$/.test(rel)) && !isUebersetzung
  for (const [line, text] of userStrings(f, src)) {
    if (isGerman) for (const h of scanRdg(text)) findings.push({ file: rel, line, code: 'rdg:' + h.code, match: h.match })
    if (isGerman && !/\.md$/.test(rel)) for (const w of scanUmlaute(text)) findings.push({ file: rel, line, code: 'umlaut', match: w })
    // Anrede: die Seite siezt ueberall (Aaron 06.09.). Nur Deutsch — die 5 uebrigen Locales
    // haben eigene Hoeflichkeitsformen, und "du" ist dort teils ein anderes Wort.
    // ⚠ `.json` ist ausgenommen: das sind DATEN, keine Ansprache. Konkret meldete
    // `stadt-verkehrsmengen.json` die Messstelle "DU Beeckerwerth" — Duisburg, kein Duzen.
    // Die Kennzeichen-Ausnahme in der Liste trifft den Satz nachweislich, greift an dieser
    // Aufrufstelle aber nicht; statt den Einzelfall zu flicken ist die ganze Dateiart raus.
    if (isGerman && !/\.json$/.test(rel)) for (const w of scanAnrede(text)) findings.push({ file: rel, line, code: 'anrede-du', match: w })
    if (/title/i.test(text) || /\|\s*Claimondo/.test(text)) if (scanTitleBrandTwice(text)) findings.push({ file: rel, line, code: 'title-brand-twice', match: text.slice(0, 80) })
  }
}

const byFile = {}
for (const f of findings) (byFile[f.file] ??= []).push(f)
const files = Object.keys(byFile).sort()
for (const file of files) { console.log(file); for (const f of byFile[file].slice(0, 12)) console.log(`  L${f.line} [${f.code}] ${f.match}`); if (byFile[file].length > 12) console.log(`  … +${byFile[file].length - 12}`) }
console.log(`\ncopy-lint: ${findings.length} Treffer in ${files.length} Files (RDG: ${findings.filter(f => f.code.startsWith('rdg')).length}, Umlaut: ${findings.filter(f => f.code === 'umlaut').length}, Titel: ${findings.filter(f => f.code === 'title-brand-twice').length}, Anrede-Du: ${findings.filter(f => f.code === 'anrede-du').length})`)

if (mode === 'update') { writeFileSync(BASELINE, JSON.stringify({ files }, null, 2) + '\n'); console.log(`Baseline geschrieben: ${files.length} Files`); process.exit(0) }
if (mode === 'ratchet') {
  const base = existsSync(BASELINE) ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).files) : new Set()
  const neu = files.filter((f) => !base.has(f))
  const rdgFiles = [...new Set(findings.filter((f) => f.code.startsWith('rdg')).map((f) => f.file))]
  if (rdgFiles.length) { console.error(`\n✗ RDG-Verstoesse (Baseline 0): ${rdgFiles.join(', ')}`); process.exit(1) }
  if (neu.length) { console.error(`\n✗ NEUE Copy-Lint-Verletzer-Files (nicht in Baseline): ${neu.join(', ')}`); process.exit(1) }
  console.log('✓ copy-lint ratchet ok')
}
