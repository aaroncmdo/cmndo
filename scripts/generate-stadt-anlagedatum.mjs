#!/usr/bin/env node
// Erzeugt claimondo-marketing/lib/kfz-gutachter/staedte-anlagedatum.json:
// je Stadt-Slug der Tag, an dem sie ins Repo kam.
//
// WOFUER: Die Sitemap meldete fuer ~23 Staedte ein `lastmod` VOR ihrer eigenen
// Entstehung — huerth wurde am 19.08.2026 angelegt und meldete 2026-05-24.
// Nicht bloss veraltet, sondern unmoeglich; und ausgerechnet die neuesten
// Seiten bekamen so das schwaechste Recrawl-Signal.
//
// Der `max(gepflegt, veroeffentlicht_am)`-Fix konnte das nicht heilen: eine
// Stadt ohne generierten Lokalinhalt hat kein `veroeffentlicht_am`. Die dritte
// Quelle ist die Git-Historie — sie weiss ohne jede Pflege, wann ein Slug
// erstmals existierte.
//
// Warum generiert statt handgepflegt: Ein Datum je Stadt von Hand nachzutragen
// ist genau der Workflow, der bei `STADT_LASTMOD_OVERRIDES` nicht mehr getragen
// hat (siehe freshness.ts). Wer Staedte hinzufuegt, faehrt dieses Skript; ein
// Test in staedte.test.ts meldet, wenn die Map hinterherhinkt.
//
// Run: node scripts/generate-stadt-anlagedatum.mjs [--check]
//   --check  schreibt nichts, sondern meldet fehlende Slugs (exit 1) — fuer CI

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const QUELLE = 'claimondo-marketing/lib/kfz-gutachter/staedte.ts'
const ZIEL = join(ROOT, 'claimondo-marketing/lib/kfz-gutachter/staedte-anlagedatum.json')

const nurPruefen = process.argv.includes('--check')
const git = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** Slugs in einer Fassung der Datei. Dasselbe Muster wie die Datei selbst schreibt. */
function slugsIn(inhalt) {
  return new Set([...inhalt.matchAll(/^\s*slug: '([a-z0-9-]+)',/gm)].map((m) => m[1]))
}

// ⚠⚠ GEGEN origin/main, NICHT gegen HEAD. Squash-Merges schreiben die Historie
// um: auf einem Feature-Branch (staging-basiert) ist der aelteste Commit auf
// staedte.ts der vom 18.07. — und der brachte 84 Staedte "auf einmal", weil er
// ein Squash ist. Gegen main sieht man denselben Bestand schon am 01.06.
//
// Ein zu SPAETES Anlagedatum ist der schaedlichere Fehler: es behauptet Frische,
// die es nicht gibt, und genau davor soll dieses Skript schuetzen. main ist die
// Release-Historie und damit die konservativere Quelle.
//
// ⚠ Auch main squasht — die Aufloesung endet beim jeweils aeltesten dort
// erhaltenen Commit. Das Ergebnis ist eine sichere UNTERE Schranke ("mindestens
// so alt"), keine Archaeologie.
//
// Chronologisch: der ERSTE Commit, in dem ein Slug auftaucht, ist sein Anlagetag.
// `--reverse` ist wichtig — sonst gewinnt der juengste Commit.
let BASIS = 'origin/main'
try {
  git(`git rev-parse --verify --quiet ${BASIS}`)
} catch {
  console.error(`⚠ ${BASIS} nicht vorhanden — falle auf HEAD zurueck. Ergebnis kann zu SPAET sein.`)
  BASIS = 'HEAD'
}
const commits = git(`git log ${BASIS} --reverse --format=%aI%x09%H -- ${QUELLE}`)
  .split('\n')
  .filter(Boolean)
  .map((z) => {
    const [datum, sha] = z.split('\t')
    return { tag: datum.slice(0, 10), sha }
  })

if (commits.length === 0) {
  console.error(`FEHLER: keine Commits auf ${QUELLE} gefunden — falsches Arbeitsverzeichnis?`)
  process.exit(1)
}

const anlage = {}
let vorher = new Set()
for (const c of commits) {
  let inhalt
  try {
    inhalt = git(`git show ${c.sha}:${QUELLE}`)
  } catch {
    continue // Datei existierte in dem Commit noch nicht unter diesem Pfad
  }
  const jetzt = slugsIn(inhalt)
  for (const slug of jetzt) if (!vorher.has(slug)) anlage[slug] = c.tag
  vorher = jetzt
}

const aktuell = slugsIn(readFileSync(join(ROOT, QUELLE), 'utf8'))
const fehlend = [...aktuell].filter((s) => !(s in anlage))

if (nurPruefen) {
  const bestand = JSON.parse(readFileSync(ZIEL, 'utf8'))
  const nichtInDatei = [...aktuell].filter((s) => !(s in bestand))
  if (nichtInDatei.length) {
    console.error(
      `[anlagedatum] ✗ ${nichtInDatei.length} Stadt/Staedte fehlen in staedte-anlagedatum.json:\n` +
        `  ${nichtInDatei.join(', ')}\n\n` +
        'Neu erzeugen mit:  node scripts/generate-stadt-anlagedatum.mjs',
    )
    process.exit(1)
  }
  console.log(`[anlagedatum] ✓ alle ${aktuell.size} Staedte haben ein Anlagedatum.`)
  process.exit(0)
}

// Sortiert schreiben — sonst erzeugt jeder Lauf einen anderen Diff.
const sortiert = Object.fromEntries(Object.entries(anlage).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(ZIEL, `${JSON.stringify(sortiert, null, 2)}\n`, 'utf8')

const proTag = new Map()
for (const tag of Object.values(sortiert)) proTag.set(tag, (proTag.get(tag) ?? 0) + 1)
console.log(`[anlagedatum] ${Object.keys(sortiert).length} Staedte aus ${commits.length} Commits.`)
for (const [tag, n] of [...proTag].sort()) console.log(`  ${tag}  ${String(n).padStart(3)}`)
if (fehlend.length) console.log(`\n⚠ ohne Datum (nicht in der Historie gefunden): ${fehlend.join(', ')}`)
