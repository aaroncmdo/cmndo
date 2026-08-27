#!/usr/bin/env node
// Ratchet: Zeitformatierung ohne feste `timeZone` in Client-Components.
// Pure Logik: scripts/lib/client-timezone-scan.mjs (unit-getestet).
//
//   npm run check:client-timezone                     -> --warn  (exit 0, listet alles)
//   npm run check:client-timezone -- --ratchet        -> blockt NEUE Verstoesse
//   npm run check:client-timezone -- --update-baseline
//
// Policy + Incident: AGENTS.md §Client-Timezone-Gate, PR #5670.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scanneDatei, trefferKey, SKIP_MARKER } from './lib/client-timezone-scan.mjs'

const ROOT = process.cwd()
const BASELINE_PATH = join(ROOT, 'scripts/client-timezone-baseline.json')
const SCAN_WURZELN = ['src/app', 'src/components']

const mode = process.argv.includes('--ratchet')
  ? 'ratchet'
  : process.argv.includes('--update-baseline')
    ? 'update'
    : 'warn'

function sammleDateien(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const eintrag of readdirSync(dir)) {
    const p = join(dir, eintrag)
    if (statSync(p).isDirectory()) {
      if (eintrag === 'node_modules' || eintrag === '__tests__') continue
      sammleDateien(p, out)
    } else if (p.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

const dateien = SCAN_WURZELN.flatMap((w) => sammleDateien(join(ROOT, w)))
const alleTreffer = []
for (const abs of dateien) {
  const rel = relative(ROOT, abs).replace(/\\/g, '/')
  alleTreffer.push(...scanneDatei(readFileSync(abs, 'utf8'), rel))
}

const uhrzeit = alleTreffer.filter((t) => t.schwere === 'uhrzeit')
const datum = alleTreffer.filter((t) => t.schwere === 'datum')
const aktuell = [...new Set(alleTreffer.map(trefferKey))].sort()

if (mode === 'update') {
  writeFileSync(BASELINE_PATH, JSON.stringify({ eintraege: aktuell }, null, 2) + '\n')
  console.log(
    `[client-timezone] Baseline geschrieben: ${aktuell.length} Eintrag/Eintraege ` +
      `(${uhrzeit.length} mit Uhrzeit, ${datum.length} nur Datum).`,
  )
  process.exit(0)
}

const baseline = existsSync(BASELINE_PATH)
  ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).eintraege ?? [])
  : []
const neu = aktuell.filter((k) => !baseline.includes(k))
const behoben = baseline.filter((k) => !aktuell.includes(k))

if (mode === 'warn') {
  for (const t of alleTreffer) {
    console.log(`[client-timezone] ${t.pfad}:${t.zeile} (${t.schwere}) ohne timeZone`)
  }
  console.log(
    `[client-timezone] ${alleTreffer.length} Stelle(n): ${uhrzeit.length} mit Uhrzeit, ` +
      `${datum.length} nur Datum. Policy: AGENTS.md §Client-Timezone-Gate`,
  )
  process.exit(0)
}

// --ratchet
if (behoben.length) {
  console.log(`[client-timezone] ✓ ${behoben.length} Eintrag/Eintraege bereinigt — Baseline senkbar:`)
  for (const k of behoben) console.log(`    ${k}`)
  console.log(`    npm run check:client-timezone -- --update-baseline`)
}

if (neu.length) {
  const neueUhrzeit = neu.filter((k) => k.endsWith('::uhrzeit'))
  console.error(`\n[client-timezone] ✗ ${neu.length} NEUE Stelle(n) ohne feste Zeitzone:\n`)
  for (const k of neu) {
    const [pfad, schwere] = k.split('::')
    const zeilen = alleTreffer.filter((t) => trefferKey(t) === k).map((t) => t.zeile)
    console.error(`    ${pfad}:${zeilen.join(',')}  (${schwere})`)
  }
  console.error(`
  Eine 'use client'-Component wird server-seitig vorgerendert UND im Browser hydriert.
  Ohne feste Zone nimmt jede Seite ihre eigene:

    prod-Node (pm2 id 862): TZ=Europe/Berlin -> "Mi., 05.08., 10:00"
    CI-Browser (GH-Runner): UTC              -> "Mi., 05.08., 08:00"

  Zwei Texte an derselben Stelle = React-Hydration-Fehler #418 (PR #5670).${
    neueUhrzeit.length
      ? `\n  ⚠ ${neueUhrzeit.length} davon formatieren eine UHRZEIT — die weichen IMMER ab, nicht nur an Tagesgrenzen.`
      : ''
  }

  Fix:
    new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', … })

  ⭐ Lokal ist die Klasse UNSICHTBAR: ein Entwickler-Browser steht in Europe/Berlin und
  rendert dasselbe wie der Server. Reproduzieren mit test.use({ timezoneId: 'UTC' }).

  Bewusst Browser-lokale Zeit? -> // ${SKIP_MARKER} <grund>  am File-Anfang.
`)
  process.exit(1)
}

console.log(
  `[client-timezone] ✓ keine neuen Stellen ohne timeZone ` +
    `(${aktuell.length} grandfathered: ${uhrzeit.length} Uhrzeit, ${datum.length} Datum).`,
)
