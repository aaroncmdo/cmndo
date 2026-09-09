#!/usr/bin/env node
// Mengenbegrenzungs-Drift-Bremse (check:mengenbegrenzung). Faengt Lesepfade auf grossen
// Tabellen, die ohne Grenze abfragen:
//
//   .from('tasks').select('…').not('faellig_am','is',null)     // ❌ still bei 1.000 gekappt
//   alleSeiten((von,bis) => q.order('id').range(von,bis))      // ✅ vollstaendig
//   .from('tasks').select('…').limit(50)                       // ✅ Grenze gewollt
//
// PostgREST liefert ohne `range` hoechstens 1.000 Zeilen — ohne Fehler, ohne Warnung.
// Belegt am 09.09.2026 (PR #5964): Der Admin-Kalender zeigte am 3. September NULL Aufgaben,
// obwohl sieben faellig waren; 930 von 1.930 fehlten. Das SV-Matching sah 1.000 von 9.712
// aktiven Leads. Beides lief monatelang stumm.
//
// Modi:
//   (default)  --warn            : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                    : exit 1 wenn NEUE Verletzer-Files ggue. Baseline (CI-Gate)
//   --update-baseline            : schreibt Baseline auf aktuelle Menge (nach Boy-Scout-Fixes)
//
// Pure Logik: scripts/lib/mengenbegrenzung-scan.mjs. Skip pro File:
// `// mengenbegrenzung-skip: <grund>`.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { scanContent, diffBaseline, GROSSE_TABELLEN } from './lib/mengenbegrenzung-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WURZEL = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'mengenbegrenzung-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function dateien(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === '__tests__') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) dateien(p, out)
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}

const treffer = []
for (const datei of dateien(join(WURZEL, 'src'))) {
  const funde = scanContent(readFileSync(datei, 'utf8'))
  if (funde.length === 0) continue
  const rel = relative(WURZEL, datei).split('\\').join('/')
  for (const f of funde) treffer.push({ datei: rel, ...f })
}

const verletzerFiles = [...new Set(treffer.map((t) => t.datei))].sort()

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, JSON.stringify({ files: verletzerFiles }, null, 2) + '\n')
  console.log(`[mengenbegrenzung] Baseline aktualisiert: ${verletzerFiles.length} File(s).`)
  process.exit(0)
}

const baseline = existsSync(BASELINE_PATH)
  ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? []
  : []
const { neu, behoben } = diffBaseline(verletzerFiles, baseline)

if (mode === 'warn') {
  console.log(
    `[mengenbegrenzung] ${treffer.length} Stelle(n) in ${verletzerFiles.length} File(s) ` +
      `auf ${Object.keys(GROSSE_TABELLEN).length} ueberwachten Tabellen.`,
  )
  for (const t of treffer.sort((a, b) => b.zeilen - a.zeilen)) {
    console.log(`  ${String(t.zeilen).padStart(6)} Zeilen  ${t.datei}:${t.line}  (${t.table})`)
  }
  if (behoben.length) console.log(`\n[mengenbegrenzung] ${behoben.length} File(s) seit der Baseline behoben.`)
  process.exit(0)
}

// ── Ratchet ────────────────────────────────────────────────────────────────
if (neu.length > 0) {
  console.error(
    `[mengenbegrenzung] ${neu.length} NEUE(S) File(s) mit ungebremstem Lesepfad auf einer ` +
      `grossen Tabelle — PostgREST kappt still bei 1.000 Zeilen:`,
  )
  for (const f of neu) {
    for (const t of treffer.filter((x) => x.datei === f)) {
      console.error(`  + ${f}:${t.line}  ${t.table} (${t.zeilen} Zeilen auf prod)`)
    }
  }
  console.error(
    `\n  Fix: alleSeiten() aus @/lib/db/alle-seiten (mit .order('id').range(von, bis))` +
      `\n       oder eine bewusste .limit()-Grenze.` +
      `\n  Bewusster Sonderfall? -> // mengenbegrenzung-skip: <grund> am File-Anfang.`,
  )
  process.exit(1)
}

console.log(
  `[mengenbegrenzung] OK — ${verletzerFiles.length} bekannte File(s) (Baseline ${baseline.length}), 0 neue.` +
    (behoben.length ? ` ${behoben.length} behoben — Baseline mit --update-baseline senken.` : ''),
)
process.exit(0)
