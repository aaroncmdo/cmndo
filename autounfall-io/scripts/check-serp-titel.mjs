#!/usr/bin/env node
// Prueft die Kurzfassungen in lib/serp-titel.ts.
//
// Warum ein Script und kein Unit-Test: autounfall-io ist ein eigener
// Top-Level-Build ohne vitest-Setup. Ein `.test.ts` hier waere toter Code.
//
//   node scripts/check-serp-titel.mjs        (bzw. npm run check:serp-titel)
//
// Geprueft wird:
//   1. Jede Kurzfassung wird vollstaendig angezeigt (<= 60 inkl. Marken-Suffix,
//      soweit `metaTitle` es anhaengt).
//   2. Keine zwei Seiten bekommen denselben Titel — sonst erzeugt das Kuerzen
//      genau das Duplicate-Signal, das es vermeiden soll.
//   3. Keine Kurzfassung ist laenger als ihr Original.
//   4. Keine Kurzfassung traegt das Suffix im Text (das haengt das Layout an).
//   5. Die Schluessel treffen die generierten REST-Titel — sonst zeigt ein
//      Eintrag nach einer Umbenennung still ins Leere.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HIER = dirname(fileURLToPath(import.meta.url))
const WURZEL = join(HIER, '..')
const SUFFIX = ' · autounfall.io'
const MAX = 60

// lib/serp-titel.ts ist ein flaches Objekt aus String-Literalen. Statt TS zu
// parsen: die Eintraege zeilenweise lesen. Ein Eintrag steht immer auf EINER
// Zeile, in der Form   'original': 'kurz',
const quelle = readFileSync(join(WURZEL, 'lib', 'serp-titel.ts'), 'utf8')
const eintraege = []
for (const zeile of quelle.split('\n')) {
  const m = zeile.match(/^\s*'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)',\s*$/)
  if (m) eintraege.push({ orig: m[1].replace(/\\'/g, "'"), kurz: m[2].replace(/\\'/g, "'") })
}

if (eintraege.length === 0) {
  console.error('ABBRUCH: keine Eintraege gelesen — hat sich das Format von serp-titel.ts geaendert?')
  process.exit(1)
}

const fehler = []

// 1. Anzeige-Laenge
for (const { orig, kurz } of eintraege) {
  const angezeigt = (kurz + SUFFIX).length <= MAX ? kurz + SUFFIX : kurz
  if (angezeigt.length > MAX) fehler.push(`  ${angezeigt.length} Zeichen (max ${MAX}): ${angezeigt}`)
}

// 2. Duplikate
const werte = eintraege.map((e) => e.kurz)
for (const w of [...new Set(werte.filter((w, i) => werte.indexOf(w) !== i))])
  fehler.push(`  doppelter Titel: ${w}`)

// 3. Nicht laenger als das Original
for (const { orig, kurz } of eintraege)
  if (kurz.length >= orig.length) fehler.push(`  nicht kuerzer: ${orig}\n      -> ${kurz}`)

// 4. Kein Suffix im Wert
for (const { kurz } of eintraege)
  if (kurz.toLowerCase().includes('autounfall.io')) fehler.push(`  Marke im Titel (Layout haengt sie an): ${kurz}`)

// 5. Treffen die Schluessel die generierten REST-Titel?
const gen = readFileSync(join(WURZEL, 'content', 'rest-pages.generated.ts'), 'utf8')
const restTitel = new Set([...gen.matchAll(/"title":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"')))
const treffer = eintraege.filter((e) => restTitel.has(e.orig)).length

console.log(`Eintraege:            ${eintraege.length}`)
console.log(`davon REST-Titel:     ${treffer}   (Rest = Seiten mit eigener page.tsx)`)
const l = eintraege.map((e) => e.kurz.length).sort((a, b) => a - b)
console.log(`Kurzfassungen: min ${l[0]} · median ${l[Math.floor(l.length / 2)]} · max ${l.at(-1)}`)
const mitMarke = eintraege.filter((e) => (e.kurz + SUFFIX).length <= MAX).length
console.log(`mit Marke (<= ${MAX - SUFFIX.length} Zeichen):  ${mitMarke}/${eintraege.length}`)

if (treffer < 20) {
  fehler.push(`  nur ${treffer} Schluessel treffen einen REST-Titel — hat sich die generierte Quelle umbenannt?`)
}

if (fehler.length) {
  console.error(`\n${fehler.length} Problem(e):`)
  for (const f of fehler) console.error(f)
  process.exit(1)
}
console.log('\nAlles in Ordnung.')
