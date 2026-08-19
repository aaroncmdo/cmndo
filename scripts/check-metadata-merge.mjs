#!/usr/bin/env node
// Metadata-Merge-Drift-Bremse. Modi:
//   (default)         --warn   : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 wenn NEUE Verletzer ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt Baseline auf aktuelle Menge (nach Fixes)
//
// Hintergrund + Fundgeschichte: scripts/lib/metadata-merge-scan.mjs und
// AGENTS.md §Metadata-Merge-Gate.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanContent, diffBaseline } from './lib/metadata-merge-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'metadata-merge-baseline.json')

// Nur die Marketing-Builds: dort definiert ein Root-Layout die SEO-Defaults,
// die eine Page-Metadata ueberschreiben kann. Die App (src/) hat kein solches
// Default-Layout — dort waere die Regel sinnlos.
const SCAN_ROOTS = [
  'claimondo-marketing/app',
  'claimondo-marketing/lib',
  'autounfall-io/app',
  'autounfall-io/lib',
  'kfz-gutachter-aachen/app',
  'kfz-gutachter-bonn/app',
  'kfz-gutachter-duesseldorf/app',
  'kfz-gutachter-koeln/app',
  'kfz-gutachter-wuppertal/app',
]

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const violations = []
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const src = readFileSync(file, 'utf8')
    if (!/\b(openGraph|twitter)\s*:\s*\{/.test(src)) continue
    // `// metadata-merge-skip: <grund>` am File-Anfang = dokumentierte Ausnahme
    if (/^\s*\/\/\s*metadata-merge-skip:/m.test(src.slice(0, 400))) continue
    const findings = scanContent(src)
    if (findings.length) {
      violations.push({ file: relative(ROOT, file).replace(/\\/g, '/'), findings })
    }
  }
}

const files = violations.map((v) => v.file).sort()

if (mode === 'warn') {
  for (const v of violations) {
    for (const f of v.findings) {
      console.warn(`[metadata-merge] ${v.file}:${f.line} — ${f.reason}`)
    }
  }
  console.log(`[metadata-merge] ${files.length} Verletzer-File(s).`)
  process.exit(0)
}

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(files, null, 2)}\n`)
  console.log(`[metadata-merge] Baseline aktualisiert: ${files.length} File(s).`)
  process.exit(0)
}

// --ratchet
if (!existsSync(BASELINE_PATH)) {
  console.error(
    '[metadata-merge] FEHLER: keine Baseline. Erst `npm run check:metadata-merge -- --update-baseline` laufen lassen.',
  )
  process.exit(1)
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
const { neu, behoben } = diffBaseline(files, baseline)

if (neu.length) {
  console.error('[metadata-merge] NEUE Verletzer gegenueber der Baseline:\n')
  for (const v of violations.filter((x) => neu.includes(x.file))) {
    for (const f of v.findings) console.error(`  ${v.file}:${f.line}\n    ${f.reason}`)
  }
  console.error(
    [
      '',
      'Next merged `metadata` nur FLACH: ein eigener openGraph/twitter-Block ersetzt den',
      'des Layouts komplett — inklusive `images`. Fix: das Default-Bild mitgeben',
      "  claimondo-marketing: `images: OG_DEFAULT_IMAGES` (aus '@/lib/seo/jsonld')",
      "  autounfall-io:       `images: [OG_IMAGE]`        (aus '@/lib/site')",
      'Echter Sonderfall -> `// metadata-merge-skip: <grund>` am File-Anfang.',
    ].join('\n'),
  )
  process.exit(1)
}

if (behoben.length) {
  console.log(
    `[metadata-merge] ${behoben.length} Verletzer behoben — Baseline senken:\n  npm run check:metadata-merge -- --update-baseline`,
  )
}
console.log(`[metadata-merge] ok (${files.length} bekannte Verletzer, 0 neue).`)
process.exit(0)
