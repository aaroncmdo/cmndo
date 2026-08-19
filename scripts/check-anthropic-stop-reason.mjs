#!/usr/bin/env node
// stop_reason-Drift-Bremse (check:anthropic-stop-reason). Faengt erzwungene
// Tool-Antworten, deren Abbruch am Token-Limit niemand bemerkt:
//
//   const block = res.content.find((b) => b.type === 'tool_use')
//   return { ok: true, deltas: block.input.deltas ?? {} }        // ❌ leer statt Fehler
//
//   if (res.stop_reason === 'max_tokens') return { ok: false, … } // ✅
//
// Die API WIRFT NICHT, wenn sie das Limit reisst — sie liefert einen halben
// tool_use-Block. Mit Fallbacks ausgelesen wird daraus stillschweigend "nichts
// gefunden". Zwei belegte Vorfaelle (18.08.2026) im Header von
// scripts/lib/anthropic-stop-reason-scan.mjs.
//
// Modi:
//   (default)  --warn        : listet Verletzer, exit 0 (Dev-Ergonomie)
//   --ratchet                : exit 1 bei NEUEN Verletzern ggue. Baseline (CI-Gate)
//   --update-baseline        : schreibt die Baseline auf die aktuelle Menge
//
// Pure Logik + Begruendung der Scan-Grenzen: scripts/lib/anthropic-stop-reason-scan.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { scanneDateien, vergleicheMitBaseline } from './lib/anthropic-stop-reason-scan.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = join(__dirname, 'anthropic-stop-reason-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

// Tests duerfen ungeprueft aufrufen: dort ist der Abbruch gemockt, und ein
// Fehlschlag waere ein roter Test statt eines stillen Datenverlusts.
const dateien = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && !f.includes('/__tests__/'))
  .map((pfad) => {
    try {
      return { pfad, quelle: readFileSync(pfad, 'utf8') }
    } catch {
      return null
    }
  })
  .filter(Boolean)

const funde = scanneDateien(dateien)
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : []
const { neu, behoben, bekannt } = vergleicheMitBaseline(funde, baseline)

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(funde.map((f) => f.datei), null, 2)}\n`, 'utf8')
  console.log(`[stop-reason] Baseline geschrieben: ${funde.length} Datei(en).`)
  process.exit(0)
}

for (const f of funde) {
  const marke = neu.some((n) => n.datei === f.datei) ? 'NEU' : 'bekannt'
  console.log(`  [${marke}] ${f.datei}:${f.zeile} — tool_choice ohne stop_reason-Pruefung`)
}

if (behoben.length) {
  console.log(
    `\n[stop-reason] ${behoben.length} Eintrag/Eintraege behoben — Baseline senken mit:\n` +
      '  npm run check:anthropic-stop-reason -- --update-baseline',
  )
}

if (mode === 'ratchet' && neu.length) {
  console.error(
    `\n[stop-reason] ✗ ${neu.length} NEUE(R) ungepruefte(r) Tool-Aufruf(e).\n` +
      'Eine abgeschnittene Antwort liefert einen halben tool_use-Block — mit Fallbacks\n' +
      'ausgelesen wird daraus still "nichts gefunden", und der Aufruf meldet Erfolg.\n\n' +
      'Fix (zwei Zeilen, VOR dem Auslesen des Blocks):\n' +
      "  if (res.stop_reason === 'max_tokens') return { ok: false, error: '… abgeschnitten' }\n\n" +
      'Ein groesseres max_tokens ist KEIN Ersatz — es verschiebt nur, ab welcher Eingabe\n' +
      'es still bricht.',
  )
  process.exit(1)
}

// Die Schlusszeile muss zur Liste darueber passen: eine erste Fassung meldete
// "keine neuen", waehrend oben zwei als NEU standen (im warn-Modus blockt nichts).
// Ein Bericht, der sich selbst widerspricht, ist schlimmer als keiner.
if (neu.length) {
  console.log(
    `\n[stop-reason] ${neu.length} ungepruefte(r) Tool-Aufruf(e) gefunden, ` +
      `${bekannt.length} davon in der Baseline. ` +
      `${mode === 'warn' ? 'Lokal nur ein Hinweis — in CI blockt --ratchet.' : ''}`,
  )
} else {
  console.log(
    `[stop-reason] ${mode === 'ratchet' ? '✓ ' : ''}keine neuen ungepruefte Tool-Aufrufe ` +
      `(${bekannt.length} grandfathered).`,
  )
}
process.exit(0)
