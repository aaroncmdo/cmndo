#!/usr/bin/env node
// Test-Drift-Bremse (vitest) — analog check-knip.mjs. Drei Modi:
//   (default)         --warn   : listet rote Test-Files, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 bei NEUEN roten Test-Files ggue. Baseline (CI-Gate)
//   --update-baseline          : schreibt die Baseline auf die aktuelle rote Menge neu
//
// WARUM: ci.yml faehrt ~20 Checks (typecheck/lint/alle Ratchets) aber NIE `vitest run`.
// `test = vitest run` existiert, wird in CI aber nie aufgerufen -> staging sammelt still
// Test-Breakage, die <30 Min spaeter auf prod steht (Marker 15.07.: 15 rote Files; am
// 19.07. gemessen: 19 Files / 31 Tests — es waechst). Dieses Gate faengt NEUE rote Files.
//
// FILE-LEVEL (nicht Test-Level): robust ggue. per-Test-Flakiness — ein Boy-Scout, der ein
// rotes File gruen macht, senkt die Baseline; ein neu rotes File blockt. `--retry=2` beim
// Lauf reduziert Flake-Rauschen (transiente Fails werden 2x nachgefahren).
//
// AGENTS.md §test-gate.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { tmpdir, platform } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'vitest-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function runVitest() {
  // Direkter bin-Pfad (wie check-knip) statt `npx` — vermeidet npm-Preamble/Version-Drift.
  const bin = join(ROOT, 'node_modules', '.bin', platform() === 'win32' ? 'vitest.cmd' : 'vitest')
  if (!existsSync(bin)) {
    console.error(`[vitest-gate] FEHLER: ${bin} nicht gefunden — \`npm ci\` lief nicht?`)
    process.exit(2)
  }
  const tmp = mkdtempSync(join(tmpdir(), 'vitest-gate-'))
  const out = join(tmp, 'results.json')
  try {
    // exit 1 bei roten Tests ist ERWARTET (wir werten die JSON aus, nicht den Exit-Code).
    execSync(`"${bin}" run --retry=2 --reporter=json --outputFile="${out}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch {
    /* vitest exit 1 = rote Tests → outputFile trotzdem lesen */
  }
  if (!existsSync(out)) {
    console.error('[vitest-gate] FEHLER: keine Ergebnis-JSON — vitest crashte vor dem Report (Setup/Import-Fehler?).')
    process.exit(2)
  }
  const json = JSON.parse(readFileSync(out, 'utf8'))
  rmSync(tmp, { recursive: true, force: true })
  return json
}

function failedFiles(json) {
  const files = (json.testResults ?? [])
    .filter((t) => t.status === 'failed')
    .map((t) => relative(ROOT, t.name).split(sep).join('/'))
  return [...new Set(files)].sort()
}

const json = runVitest()
const cur = failedFiles(json)
const summary = `${json.numFailedTests ?? '?'}/${json.numTotalTests ?? '?'} Tests rot in ${cur.length} File(s)`

if (mode === 'update') {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'Bekannte rote Test-Files (grandfathered, file-level). Der Ratchet blockt NEUE. Boy-Scout: File fixen + Baseline via `npm run check:vitest -- --update-baseline` senken. Echter Flake -> hier belassen + im PR begruenden.',
        fileCount: cur.length,
        files: cur,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`[vitest-gate] Baseline aktualisiert: ${cur.length} rote Files (${summary}) -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[vitest-gate] FEHLER: keine Baseline. Erst `npm run check:vitest -- --update-baseline`.')
    process.exit(1)
  }
  const base = new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files ?? [])
  const neu = cur.filter((f) => !base.has(f))
  if (neu.length) {
    console.error(`[vitest-gate] ${neu.length} NEU fehlschlagende Test-File(s) — fixen (oder bei echtem Flake in scripts/vitest-baseline.json aufnehmen + im PR begruenden):`)
    for (const f of neu) console.error(`  + ${f}`)
    process.exit(1)
  }
  const fixed = [...base].filter((f) => !cur.includes(f))
  if (fixed.length) {
    console.log(`[vitest-gate] ${fixed.length} Test-File(s) wieder gruen — Baseline senkbar: \`npm run check:vitest -- --update-baseline\``)
  }
  console.log(`[vitest-gate] OK — ${cur.length} bekannte rote Files (Baseline ${base.size}), 0 neue. (${summary})`)
  process.exit(0)
}

// warn (default)
console.log(`[vitest-gate] ${summary}.`)
for (const f of cur) console.log(`  - ${f}`)
console.log('[vitest-gate] (--warn: nichts blockiert. CI-Gate via --ratchet blockt NEUE rote Files.) Policy: AGENTS.md §test-gate')
process.exit(0)
