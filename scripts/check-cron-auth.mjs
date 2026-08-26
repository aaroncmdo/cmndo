#!/usr/bin/env node
/**
 * Cron-Auth-Gate: blockt NEUE Auth-Pruefungen, die nicht fail-closed sind.
 *
 * Hintergrund + Fundstellen: scripts/lib/cron-auth-scan.mjs.
 * Kurz: `authHeader !== `Bearer ${process.env.CRON_SECRET}`` laesst ohne gesetztes Secret
 * den Header "Bearer undefined" durch. Richtig ist `assertCronAuth(request)` aus
 * `@/lib/auth/cron-auth` — der prueft zuerst, ob ueberhaupt ein Secret existiert.
 *
 * Modi:  --ratchet          exit 1 bei NEUEN Verstoessen (CI)
 *        --update-baseline  Baseline neu schreiben (nach bewusstem Abbau)
 *        (ohne Flag)        --warn, exit 0
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanneCronAuth } from './lib/cron-auth-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'cron-auth-baseline.json')
const SCAN_ROOT = join(ROOT, 'src', 'app', 'api')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (e === 'route.ts') out.push(p)
  }
  return out
}

const verletzer = []
for (const datei of walk(SCAN_ROOT)) {
  const funde = scanneCronAuth(readFileSync(datei, 'utf8'))
  if (funde.length > 0) {
    verletzer.push({
      datei: relative(ROOT, datei).replace(/\\/g, '/'),
      funde: funde.map((f) => f.grund),
    })
  }
}

const aktuell = verletzer.map((v) => v.datei).sort()
const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? []
  : []

console.log(`[cron-auth] ${walk(SCAN_ROOT).length} Routen geprueft · ${aktuell.length} Verletzer (Baseline: ${baseline.length})`)

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, JSON.stringify({ files: aktuell }, null, 2) + '\n')
  console.log(`[cron-auth] Baseline geschrieben: ${aktuell.length} Eintrag/Eintraege`)
  process.exit(0)
}

const neu = aktuell.filter((f) => !baseline.includes(f))
const behoben = baseline.filter((f) => !aktuell.includes(f))

if (behoben.length > 0) {
  console.log(`[cron-auth] ${behoben.length} behoben — Baseline senken mit --update-baseline:`)
  for (const f of behoben) console.log(`    ${f}`)
}

if (neu.length === 0) {
  console.log('[cron-auth] ✅ keine neuen Verstoesse')
  process.exit(0)
}

console.log(`\n[cron-auth] ❌ ${neu.length} NEUE(R) Verstoss/Verstoesse:`)
for (const datei of neu) {
  const v = verletzer.find((x) => x.datei === datei)
  console.log(`  ${datei}  [${v.funde.join(', ')}]`)
}
console.log(`
  -> Ersetze den Direktvergleich durch \`assertCronAuth(request)\`
     (import { assertCronAuth } from '@/lib/auth/cron-auth').
  -> Braucht die Route einen ZWEITEN Header-Weg (wie notifications/process mit
     'x-internal-token')? Dann nicht ersetzen, sondern das Secret einmal lesen und
     bei Abwesenheit fruehzeitig 401 liefern — die Zwei-Wege-Logik bleibt erhalten.
`)

if (mode === 'ratchet') process.exit(1)
process.exit(0)
