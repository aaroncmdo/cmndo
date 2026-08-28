#!/usr/bin/env node
/**
 * Result-Catch-Gate: blockt `.catch(() => {})` um eine Action, die ein Result-Object liefert.
 *
 * Hintergrund + Fundstellen: scripts/lib/result-catch-scan.mjs.
 * Kurz: Diese Actions WERFEN NIE — der Fehlschlag steht im Rueckgabewert. Ein leeres
 * `.catch()` sieht wie Fehlerbehandlung aus und ist keine.
 *
 * Modi:  --ratchet          exit 1 bei NEUEN Verstoessen (CI)
 *        --update-baseline  Baseline neu schreiben
 *        (ohne Flag)        --warn, exit 0
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanneResultCatch, sammleResultFunktionen } from './lib/result-catch-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'result-catch-baseline.json')
const SCAN_ROOT = join(ROOT, 'src')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (!/node_modules|\.next/.test(p)) walk(p, out)
    } else if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const dateien = walk(SCAN_ROOT)
const inhalte = new Map(dateien.map((f) => [f, readFileSync(f, 'utf8')]))

// Die Namensmenge kommt aus dem GESAMTEN Baum — eine Action wird woanders definiert
// als aufgerufen.
const resultFns = sammleResultFunktionen([...inhalte.values()])

const verletzer = []
for (const [datei, inhalt] of inhalte) {
  // Tests duerfen das Muster zeigen (sie pruefen es).
  if (/__tests__|\.test\.tsx?$/.test(datei)) continue
  const funde = scanneResultCatch(inhalt, resultFns)
  if (funde.length > 0) {
    verletzer.push({ datei: relative(ROOT, datei).replace(/\\/g, '/'), funde })
  }
}

const aktuell = verletzer.map((v) => v.datei).sort()
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? []
  : []

console.log(
  `[result-catch] ${dateien.length} Dateien · ${resultFns.size} Result-Actions bekannt · ` +
    `${aktuell.length} Verletzer (Baseline: ${baseline.length})`,
)

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, JSON.stringify({ files: aktuell }, null, 2) + '\n')
  console.log(`[result-catch] Baseline geschrieben: ${aktuell.length} Eintrag/Eintraege`)
  process.exit(0)
}

const neu = aktuell.filter((f) => !baseline.includes(f))
const behoben = baseline.filter((f) => !aktuell.includes(f))

if (behoben.length > 0) {
  console.log(`[result-catch] ${behoben.length} behoben — Baseline senken mit --update-baseline`)
}

if (neu.length === 0) {
  console.log('[result-catch] ✅ keine neuen Verstoesse')
  process.exit(0)
}

console.log(`\n[result-catch] ❌ ${neu.length} NEUE(R) Verstoss/Verstoesse:`)
for (const datei of neu) {
  for (const f of verletzer.find((v) => v.datei === datei).funde) {
    console.log(`  ${datei}:${f.zeile}  -> ${f.fn}()`)
    console.log(`      ${f.text}`)
  }
}
console.log(`
  -> Diese Action liefert ein Result-Object und WIRFT NIE. Das leere .catch() faengt
     also nichts; der Fehlschlag steht im Rueckgabewert.
  -> Entweder auswerten:      const r = await fn(); if (!r.ok) { … }
  -> oder bewusst nebenlaeufig MIT Spur:
       void fn(...).then((r) => { if (!r.ok) console.warn(…) })
     Ein .catch(e => console.error(e)) allein genuegt nicht — es sieht den Fall gar nicht.
`)

if (mode === 'ratchet') process.exit(1)
process.exit(0)
