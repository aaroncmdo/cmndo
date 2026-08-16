#!/usr/bin/env node
// Stille-Write-Drift-Bremse (check:silent-writes). Faengt Supabase-Writes auf schadens-
// traechtige Tabellen, deren Ergebnis niemand liest:
//
//   await db.from('claims').update({ … }).eq('id', id)        // ❌ Fehler unsichtbar
//   const { error } = await db.from('claims').update({ … })   // ✅
//
// supabase-js WIRFT NICHT — ein nicht gelesenes `{ error }` ist von Erfolg ununterscheidbar.
// Drei belegte Vorfaelle (DSGVO-Storno 19.07., J2-Seed + Skizzen-Korrektur 16.08.) im Header
// von scripts/lib/silent-write-scan.mjs.
//
// Modi:
//   (default)  --warn            : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 wenn NEUE Verletzer-Files ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt Baseline auf aktuelle Menge (nach Boy-Scout-Fixes)
//
// Pure Logik: scripts/lib/silent-write-scan.mjs. Skip pro File: `// silent-write-skip: <grund>`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanContent, diffBaseline, KRITISCHE_TABELLEN } from './lib/silent-write-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'silent-write-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  // Tests + Seeds duerfen ungeprueft schreiben: dort ist ein Fehlschlag laut (roter Test)
  // statt still, und Seed-Skripte raeumen ohnehin gegen bekannte Fixtures auf.
  .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && !f.includes('/__tests__/'))

const treffer = new Map() // file -> Array<{line,table,methode}>
for (const f of files) {
  let src
  try {
    src = readFileSync(f, 'utf8')
  } catch {
    continue
  }
  const gefunden = scanContent(src)
  if (gefunden.length) treffer.set(f, gefunden)
}

const aktuell = [...treffer.keys()].sort()
const gesamt = [...treffer.values()].reduce((n, v) => n + v.length, 0)

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, JSON.stringify({ files: aktuell }, null, 2) + '\n')
  console.log(`[silent-writes] Baseline geschrieben: ${aktuell.length} File(s), ${gesamt} Stelle(n).`)
  process.exit(0)
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? []
  : []
const { neu, behoben } = diffBaseline(aktuell, baseline)

if (mode === 'warn') {
  for (const [f, v] of treffer) {
    for (const t of v) {
      console.log(`[silent-writes] ${f}:${t.line}: ${t.methode} auf ${t.table} ohne Fehlerpruefung`)
    }
  }
  console.log(
    `[silent-writes] ${gesamt} Stelle(n) in ${aktuell.length} File(s) (${files.length} geprueft).` +
      ` Tabellen: ${KRITISCHE_TABELLEN.join(', ')}. Policy: AGENTS.md §Stille-Write-Gate`,
  )
  process.exit(0)
}

// --ratchet
if (behoben.length) {
  console.log(`[silent-writes] ✓ ${behoben.length} File(s) bereinigt — Baseline kann gesenkt werden:`)
  for (const f of behoben) console.log(`    ${f}`)
  console.log(`    npm run check:silent-writes -- --update-baseline`)
}

if (neu.length) {
  console.error(`\n[silent-writes] ✗ ${neu.length} File(s) mit NEUEN ungeprueften Writes:\n`)
  for (const f of neu) {
    for (const t of treffer.get(f)) {
      console.error(`    ${f}:${t.line}: ${t.methode} auf ${t.table}`)
    }
  }
  console.error(`
  supabase-js wirft NICHT. Ein nicht gelesenes { error } ist von Erfolg ununterscheidbar.

  Fix:
    const { error } = await db.from('${KRITISCHE_TABELLEN[0]}').update({ … }).eq('id', id)
    if (error) { … }

  Laeuft der Write ueber den RLS-Client (createClient, nicht createAdminClient), zusaetzlich
  .select() anhaengen und die Row-Zahl pruefen: ein RLS-gefiltertes UPDATE trifft 0 Rows OHNE
  Fehler (DSGVO-Storno-Incident 19.07.).

  Bewusst fire-and-forget? -> // silent-write-skip: <grund>  am File-Anfang.
`)
  process.exit(1)
}

console.log(
  `[silent-writes] ✓ keine neuen ungeprueften Writes (${gesamt} Stelle(n) in ${aktuell.length} File(s) grandfathered).`,
)
