#!/usr/bin/env node
// Erzeugt src/lib/lokalinhalt/staedte-stammdaten.json aus der Staedte-Liste des
// Marketing-Builds (claimondo-marketing/lib/kfz-gutachter/staedte.ts).
//
// WARUM ein generierter Snapshot statt eines direkten Imports:
// `src/` und `claimondo-marketing/` sind getrennte Next-Builds. src/tsconfig
// mappt "@/*" ausschliesslich auf "./src/*" — ein Cross-Projekt-Import ist
// nicht moeglich. Der Admin (in src/) braucht die Ortsfakten aber, um daraus
// den Generierungs-Prompt zu bauen.
//
// WARUM kein DB-Seeding: Die Stammdaten (Gerichte, PLZ, Einwohner) werden im
// Code gepflegt, nicht im Admin. Eine DB-Tabelle waere eine zweite Quelle der
// Wahrheit, die auseinanderlaufen kann. Ein generierter Snapshot hat genau eine
// Quelle und ist per Diff pruefbar — dasselbe Muster wie
// scripts/lib/status-check-constraints.json.
//
// Nutzung:
//   node scripts/build-stadt-stammdaten.mjs           # schreibt die Datei
//   node scripts/build-stadt-stammdaten.mjs --check   # prueft nur auf Drift (CI)
//
// Nach JEDER Aenderung an STAEDTE neu laufen lassen.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const QUELLE = join(ROOT, 'claimondo-marketing', 'lib', 'kfz-gutachter', 'staedte.ts')
const ZIEL = join(ROOT, 'src', 'lib', 'lokalinhalt', 'staedte-stammdaten.json')

/** Untergrenze als Reissleine: faellt der Parser auseinander, brechen wir ab
 *  statt eine fast leere Datei zu schreiben. */
const MIN_ERWARTETE_STAEDTE = 50

function parseStaedte(quelltext) {
  // Nur das STAEDTE-Array betrachten — danach folgt HYPERLOCAL_DATA mit
  // gleichnamigen Feldern, das wuerde die Zuordnung verfaelschen.
  const start = quelltext.indexOf('export const STAEDTE')
  if (start < 0) throw new Error('export const STAEDTE nicht gefunden')
  const ende = quelltext.indexOf('\n]', start)
  if (ende < 0) throw new Error('Ende des STAEDTE-Arrays nicht gefunden')
  const block = quelltext.slice(start, ende)

  const re =
    /slug: '([a-z0-9-]+)',\s*\n\s*name: '([^']+)',\s*\n\s*bundesland: '([^']+)',\s*\n\s*plzPrefix: '([^']+)',\s*\n\s*bevoelkerung: '([^']+)',\s*\n\s*lat: ([-0-9.]+),\s*\n\s*lng: ([-0-9.]+),\s*\n\s*lokal: \{\s*\n\s*landgericht: '([^']+)',\s*\n\s*amtsgericht: '([^']+)',\s*\n\s*kammer: '([^']+)',\s*\n\s*\},\s*\n\s*bvskHonorarSpanne: '([^']+)',/g

  const staedte = []
  let m
  while ((m = re.exec(block))) {
    staedte.push({
      slug: m[1],
      name: m[2],
      bundesland: m[3],
      plzPrefix: m[4],
      bevoelkerung: m[5],
      lat: Number(m[6]),
      lng: Number(m[7]),
      landgericht: m[8],
      amtsgericht: m[9],
      kammer: m[10],
      bvskHonorarSpanne: m[11],
    })
  }
  return staedte
}

function main() {
  const nurPruefen = process.argv.includes('--check')

  const staedte = parseStaedte(readFileSync(QUELLE, 'utf8'))

  if (staedte.length < MIN_ERWARTETE_STAEDTE) {
    console.error(
      `FEHLER: nur ${staedte.length} Staedte geparst (erwartet >= ${MIN_ERWARTETE_STAEDTE}).\n` +
        'Wahrscheinlich hat sich die Formatierung von staedte.ts geaendert und die\n' +
        'Regex passt nicht mehr. NICHT die Untergrenze senken — den Parser anpassen.',
    )
    process.exit(1)
  }

  const doppelt = staedte.map((s) => s.slug).filter((s, i, a) => a.indexOf(s) !== i)
  if (doppelt.length) {
    console.error(`FEHLER: doppelte Slugs: ${[...new Set(doppelt)].join(', ')}`)
    process.exit(1)
  }

  // Nachbarorte hier VORBERECHNEN, statt die Geo-Logik in src/ zu duplizieren.
  // Das Marketing rendert seine Nachbarn ueber lib/kfz-gutachter/nachbarstaedte.ts;
  // src/ braucht sie nur als Prompt-Kontext, also reicht die fertige Liste.
  const ERDRADIUS_KM = 6371
  const bogen = (g) => (g * Math.PI) / 180
  const distanzKm = (a, b) => {
    const dLat = bogen(b.lat - a.lat)
    const dLng = bogen(b.lng - a.lng)
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(bogen(a.lat)) * Math.cos(bogen(b.lat)) * Math.sin(dLng / 2) ** 2
    return Math.round(2 * ERDRADIUS_KM * Math.asin(Math.sqrt(h)))
  }

  for (const s of staedte) {
    s.nachbarorte = staedte
      .filter((x) => x.slug !== s.slug)
      .map((x) => ({ name: x.name, km: distanzKm(s, x) }))
      .sort((a, b) => a.km - b.km || a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((x) => x.name)
  }

  staedte.sort((a, b) => a.slug.localeCompare(b.slug))
  const inhalt = JSON.stringify(staedte, null, 2) + '\n'

  if (nurPruefen) {
    let vorhanden = ''
    try {
      vorhanden = readFileSync(ZIEL, 'utf8')
    } catch {
      console.error(`FEHLER: ${ZIEL} fehlt. Erzeugen mit: node scripts/build-stadt-stammdaten.mjs`)
      process.exit(1)
    }
    if (vorhanden !== inhalt) {
      console.error(
        'FEHLER: staedte-stammdaten.json ist nicht mehr aktuell (STAEDTE wurde geaendert).\n' +
          'Neu erzeugen mit: node scripts/build-stadt-stammdaten.mjs',
      )
      process.exit(1)
    }
    console.log(`OK — Snapshot aktuell (${staedte.length} Staedte).`)
    return
  }

  writeFileSync(ZIEL, inhalt, 'utf8')
  console.log(`geschrieben: ${staedte.length} Staedte -> ${ZIEL}`)
}

main()
