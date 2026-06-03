#!/usr/bin/env node
// Dead-Code-Drift-Bremse (knip). Drei Modi:
//   (default)         --warn   : listet alle knip-Funde, exit 0 (Dev-Ergonomie)
//   --ratchet                  : exit 1 bei NEUEN unused files ODER neuen unused/unlisted
//                                deps ggue. Baseline (CI-Gate). Exports/Types nur --warn.
//   --update-baseline          : schreibt die Files-Baseline auf die aktuelle Menge neu.
//
// Gegate werden NUR Files + Dependencies (verlaesslichste Kategorien). Unused exports
// (~200) + types sind zu FP-behaftet (Barrel-Re-Exports, Server-Actions via action={fn})
// und laufen daher als --warn — sichtbar, aber nicht blockierend.
//
// Dep-Whitelist (WHITELISTED_DEPS): von knip als unused gemeldet, aber via Config/CSS/
// CLI/ambient-Types echt genutzt — verifiziert 2026-05-29. Diese duerfen NICHT als neuer
// Verstoss zaehlen. Siehe docs/superpowers/specs/2026-05-29-knip-deadcode-audit.md.
//
// AGENTS.md §dead-code-gate.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { platform } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASELINE_PATH = join(__dirname, 'knip-baseline.json')

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

// FALSE-POSITIVE-Whitelist: von knip als unused dep/devDep gemeldet, aber echt genutzt.
// Verifiziert 2026-05-29 (17-Agenten-Audit, je file:line-Beweis — siehe knip-deadcode-audit.md).
// Wird zur Laufzeit aus den gemeldeten unused-deps herausgefiltert, damit das Gate sie nie
// einfordert (sonst CI-Bruch wie der @types/google.maps-Incident in #2015).
const WHITELISTED_DEPS = new Set([
  '@types/mapbox-gl', // type-only `import type { Map } from 'mapbox-gl'` in 18+ Files
  '@types/google.maps', // ambient global `google.maps.*` (Script-Tag-Load), 8 Files; Drop bricht tsc (#2015)
  '@types/pdf-parse', // `import('pdf-parse')`-Type-Cast in OCR-Routen + serverExternalPackage
  'next-themes', // useTheme() in components/ui/sonner.tsx
  'shadcn', // CSS @import "shadcn/tailwind.css" in globals.css (knip parst kein CSS)
  'tailwindcss', // CSS @import "tailwindcss" in globals.css + PostCSS-Plugin-Kette via @tailwindcss/postcss
  'tw-animate-css', // CSS @import "tw-animate-css" in globals.css
  'supabase', // CLI: npx supabase in scripts/ + Edge-Functions
])

// Unlisted, die transitiv/builtin bereitgestellt werden (kein echter Bug) → ignorieren.
const IGNORED_UNLISTED = new Set([
  '@next/env', // transitiv via next (sentry.server.config.ts)
  '@react-email/preview-server', // transitiv via react-email
  'google-auth-library', // transitiv via googleapis (type-only OAuth2Client)
  'server-only', // Next.js-Builtin-Marker
])

function runKnip() {
  // Direkter bin-Pfad statt `npx knip` — vermeidet (a) `npm warn`/Auto-Install-Preamble vor
  // dem JSON, (b) Version-Drift wenn `npx` ein cachedes knip findet. Wenn knip fehlt:
  // fail fast statt silent download. Windows nutzt knip.cmd, Unix knip (CI ist Linux).
  const binDir = join(ROOT, 'node_modules', '.bin')
  const knipBin = join(binDir, platform() === 'win32' ? 'knip.cmd' : 'knip')
  if (!existsSync(knipBin)) {
    console.error(`[knip] FEHLER: ${knipBin} nicht gefunden. \`npm ci\` lief nicht oder knip ist nicht in package.json.`)
    process.exit(2)
  }
  let raw, stderr
  try {
    raw = execSync(`"${knipBin}" --no-progress --reporter json`, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) {
    // knip exit 1 wenn Funde existieren — stdout trotzdem auswerten.
    raw = e.stdout?.toString() ?? ''
    stderr = e.stderr?.toString() ?? ''
  }
  if (!raw.trim()) {
    console.error('[knip] FEHLER: knip lieferte keinen JSON-Output.')
    if (stderr) console.error('[knip] stderr:', stderr.slice(0, 1000))
    process.exit(2)
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    console.error('[knip] FEHLER: JSON-Parse-Fehler — knip-Output beginnt nicht mit JSON. Erste 500 Zeichen:')
    console.error(raw.slice(0, 500))
    if (stderr) console.error('[knip] stderr:', stderr.slice(0, 1000))
    process.exit(2)
  }
}

function collect(report) {
  const files = []
  const unusedDeps = []
  const unlisted = []
  const exportsList = []
  const typesList = []
  for (const it of report.issues ?? []) {
    // knip-JSON: it.files ist ein Array — nicht-leer = das File selbst ist unused.
    // (Leeres [] heisst nur: dieses File hat ANDERE Issues wie unused exports.)
    if (Array.isArray(it.files) && it.files.length > 0) files.push(it.file)
    for (const d of it.dependencies ?? []) unusedDeps.push(d.name ?? d)
    for (const d of it.devDependencies ?? []) unusedDeps.push(d.name ?? d)
    for (const u of it.unlisted ?? []) unlisted.push(u.name ?? u)
    for (const x of it.exports ?? []) exportsList.push(`${it.file}: ${x.name ?? x}`)
    for (const x of it.types ?? []) typesList.push(`${it.file}: ${x.name ?? x}`)
  }
  const uniq = (arr) => [...new Set(arr)].sort()
  return {
    files: uniq(files),
    // Whitelist rausfiltern → nur echte unused deps gaten; dedupliziert:
    unusedDeps: uniq(unusedDeps.filter((d) => !WHITELISTED_DEPS.has(d))),
    unlisted: uniq(unlisted.filter((d) => !IGNORED_UNLISTED.has(d))),
    exports: uniq(exportsList),
    types: uniq(typesList),
  }
}

function diff(current, baseline) {
  const base = new Set(baseline)
  return current.filter((x) => !base.has(x)).sort()
}

const report = runKnip()
const cur = collect(report)

if (mode === 'update') {
  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Files + gegatete Deps eingefroren. Exports/Types sind --warn (nicht gegatet).',
    fileCount: cur.files.length,
    files: cur.files,
    unusedDeps: cur.unusedDeps,
    unlisted: cur.unlisted,
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[knip] Baseline aktualisiert: ${cur.files.length} Files, ${cur.unusedDeps.length} unused deps, ${cur.unlisted.length} unlisted -> ${BASELINE_PATH}`)
  process.exit(0)
}

if (mode === 'ratchet') {
  if (!existsSync(BASELINE_PATH)) {
    console.error('[knip] FEHLER: keine Baseline. Erst `npm run check:knip -- --update-baseline` laufen lassen.')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const newFiles = diff(cur.files, baseline.files ?? [])
  const newDeps = diff(cur.unusedDeps, baseline.unusedDeps ?? [])
  const newUnlisted = diff(cur.unlisted, baseline.unlisted ?? [])

  let fail = false
  if (newFiles.length) {
    fail = true
    console.error(`[knip] ${newFiles.length} NEUE ungenutzte Datei(en) (toter Code) — entfernen ODER Consumer verdrahten:`)
    for (const f of newFiles) console.error(`  + ${f}`)
  }
  if (newDeps.length) {
    fail = true
    console.error(`[knip] ${newDeps.length} NEUE ungenutzte Dependenc(y/ies) — aus package.json entfernen ODER (FP) in WHITELISTED_DEPS in scripts/check-knip.mjs dokumentieren:`)
    for (const d of newDeps) console.error(`  + ${d}`)
  }
  if (newUnlisted.length) {
    fail = true
    console.error(`[knip] ${newUnlisted.length} NEUE unlisted Dependenc(y/ies) — in package.json deklarieren ODER (transitiv/builtin) in IGNORED_UNLISTED dokumentieren:`)
    for (const d of newUnlisted) console.error(`  + ${d}`)
  }
  if (fail) {
    console.error('Wenn der Bestand bewusst geschrumpft wurde: `npm run check:knip -- --update-baseline` + im PR begruenden.')
    process.exit(1)
  }

  const removedFiles = diff(baseline.files ?? [], cur.files)
  if (removedFiles.length) {
    console.log(`[knip] ${removedFiles.length} tote Datei(en) entfernt — Baseline kann gesenkt werden: \`npm run check:knip -- --update-baseline\``)
  }
  console.log(`[knip] OK — ${cur.files.length} bekannte tote Files (Baseline ${(baseline.files ?? []).length}), ${cur.unusedDeps.length} unused deps, 0 neue.`)
  console.log(`[knip] (Nicht gegatet: ${cur.exports.length} unused exports, ${cur.types.length} unused types — --warn)`)
  process.exit(0)
}

// warn (default) — alles listen, exit 0
console.log(`[knip] ${cur.files.length} ungenutzte Files, ${cur.unusedDeps.length} unused deps, ${cur.unlisted.length} unlisted, ${cur.exports.length} unused exports, ${cur.types.length} unused types.`)
console.log('[knip] (--warn: nichts blockiert. CI-Gate via --ratchet blockt NEUE Files+Deps.) Policy: AGENTS.md §dead-code-gate')
process.exit(0)
