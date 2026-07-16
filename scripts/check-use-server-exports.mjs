// Guard: Datei-Level-'use server'-Dateien duerfen zur Laufzeit NUR Server Actions exportieren.
//
// Hintergrund (PR #4439, 16.07.): `export type { EmbedFoto, ... }` in embed/werkstatt-finder/actions.ts
// -> der Server-Actions-Loader macht aus JEDEM Export-Namen ein Action-Binding -> ReferenceError bei
// der Modul-Evaluation -> ALLE Actions der Datei antworteten 500; der Embed war seit Deploy tot.
// tsc / next build / vitest sind fuer diese Klasse BLIND (Types werden im Transform gestrippt; der
// Crash entsteht erst im Actions-Loader zur Laufzeit) -> dieser statische Check ist das Gate.
//
// VERBOTEN in Datei-Level-'use server'-Files:
//   export type { X }                  Type-RE-EXPORT  -> Loader-Binding auf Nicht-Wert (#4439-Killer)
//   export { X } / export { X } from   Value-Re-Export -> kein Action-Export
//   export * from                      Star-Re-Export
//   export const|let|var|enum|class    AAR-664: Client-Bundle -> undefined; keine Action
//   export function (sync)             keine Action
//   export default (ausser async fn)   keine Action
// ERLAUBT:
//   export async function ...          die Server Action selbst
//   export type X = ...                Typ-DEKLARATION (SWC entfernt sie vollstaendig)
//   export interface X { ... }         dito
//
// Nutzung:  node scripts/check-use-server-exports.mjs [rootDir]   (default: src)
//           node scripts/check-use-server-exports.mjs --selftest

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIREKTIVE = /^(['"])use server\1;?\s*$/

const VERBOTEN = [
  { re: /^export\s+type\s*\{/, warum: 'Type-Re-Export (export type { ... }) — der #4439-Killer' },
  { re: /^export\s*\{/, warum: 'Value-Re-Export (export { ... })' },
  { re: /^export\s*\*/, warum: 'Star-Re-Export (export * from ...)' },
  { re: /^export\s+(const|let|var|enum)\b/, warum: 'Werte-Export (AAR-664: Client-Bundle -> undefined)' },
  { re: /^export\s+(abstract\s+)?class\b/, warum: 'Klassen-Export' },
  { re: /^export\s+function\b/, warum: 'synchrone Funktion (keine Server Action)' },
  { re: /^export\s+default\b(?!\s+async\s+function)/, warum: 'default-Export (keine async function)' },
]

/** Ist die Datei eine Datei-Level-'use server'-Datei? (Direktive vor dem ersten echten Statement) */
export function hatUseServerDirektive(quelltext) {
  let imBlockKommentar = false
  for (const zeile of quelltext.split(/\r?\n/)) {
    const t = zeile.trim()
    if (imBlockKommentar) {
      if (t.includes('*/')) imBlockKommentar = false
      continue
    }
    if (t === '' || t.startsWith('//')) continue
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) imBlockKommentar = true
      continue
    }
    return DIREKTIVE.test(t)
  }
  return false
}

/** Liefert Verstoesse [{zeile, text, warum}] fuer eine use-server-Datei. */
export function pruefeExports(quelltext) {
  const funde = []
  quelltext.split(/\r?\n/).forEach((zeile, i) => {
    for (const { re, warum } of VERBOTEN) {
      if (re.test(zeile)) {
        funde.push({ zeile: i + 1, text: zeile.trim().slice(0, 90), warum })
        break
      }
    }
  })
  return funde
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue
      yield* walk(p)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      yield p
    }
  }
}

function selftest() {
  const faelle = [
    // [quelltext-Zeile, sollte-verboten-sein]
    ["export type { EmbedFoto, Reparaturbedarf, Fit }", true],
    ["export { irgendwas }", true],
    ["export * from './woanders'", true],
    ['export const MAX = 3', true],
    ['export enum Farbe { rot }', true],
    ['export class Ding {}', true],
    ['export function sync() {}', true],
    ['export default function x() {}', true],
    ['export async function meineAction() {', false],
    ['export type Payload = {', false],
    ['export interface Patch {', false],
    ['export default async function action() {', false],
  ]
  let fail = 0
  for (const [zeile, erwartet] of faelle) {
    const ist = pruefeExports(zeile).length > 0
    if (ist !== erwartet) {
      fail++
      console.error(`SELFTEST FAIL: "${zeile}" -> verboten=${ist}, erwartet=${erwartet}`)
    }
  }
  const dir = [
    "'use server'",
    '"use server";',
    "// Kommentar\n'use server'",
    "/* Block */\n'use server'",
  ].every((q) => hatUseServerDirektive(q))
  const nicht = ["import x from 'y'\n'use server'", "function f() {\n  'use server'\n}"].every(
    (q) => !hatUseServerDirektive(q),
  )
  if (!dir || !nicht) {
    fail++
    console.error(`SELFTEST FAIL: Direktive-Erkennung (dateiweit=${dir}, negativ=${nicht})`)
  }
  console.log(fail === 0 ? `SELFTEST OK (${faelle.length} Faelle + Direktive)` : `SELFTEST: ${fail} FAILS`)
  process.exit(fail === 0 ? 0 : 1)
}

const arg = process.argv[2]
if (arg === '--selftest') selftest()

const root = arg || 'src'
let geprueft = 0
const report = []
for (const file of walk(root)) {
  const quelltext = readFileSync(file, 'utf8')
  if (!hatUseServerDirektive(quelltext)) continue
  geprueft++
  for (const f of pruefeExports(quelltext)) {
    report.push(`${file}:${f.zeile}  ${f.warum}\n    ${f.text}`)
  }
}

if (report.length > 0) {
  console.error(`✗ ${report.length} verbotene Exporte in 'use server'-Dateien (500-Gefahr, s. PR #4439):\n`)
  console.error(report.join('\n'))
  console.error(`\nFix: Re-Exports entfernen (Types direkt aus dem Quellmodul importieren);`)
  console.error(`Konstanten in ein normales Modul verschieben. Erlaubt sind NUR async functions`)
  console.error(`+ type/interface-DEKLARATIONEN.`)
  process.exit(1)
}
console.log(`✓ use-server-Export-Guard: ${geprueft} Datei-Level-'use server'-Dateien sauber.`)
