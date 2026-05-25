#!/usr/bin/env node
// Einmal-Repair der 10 Decoder-Schema-Bloecke.
// Problem: in JSON-String-Werten (v.a. das headline-Feld "...Titel<U+0022> - Decoder")
// steht ein gerades ASCII-Quote (U+0022) als deutsches Schluss-Zeichen. Das beendet
// den JSON-String vorzeitig -> JSON.parse-Fehler -> Renderer faellt auf
// articleSchema zurueck (extractSchemaJson liefert null).
//
// Fix: NUR im json-Block unter "## Schema (JSON-LD)" jedes Muster
//   U+201E <text ohne quote> U+0022   ->   U+201E <text> U+201C
// Danach JSON.parse zur Verifikation.
//
// Alle Quote-Zeichen via numerischem Codepoint (String.fromCodePoint) — reiner
// ASCII-Quelltext, damit keine Editor/Tool-Normalisierung etwas verfaelscht.
import fs from 'node:fs'
import path from 'node:path'

const OPEN = String.fromCodePoint(0x201e)   // deutsches oeffnendes Anfuehrungszeichen
const CLOSE = String.fromCodePoint(0x201c)  // deutsches schliessendes
const RDQUO = String.fromCodePoint(0x201d)  // engl. schliessendes (nur Negativ-Klasse)
const STR = String.fromCodePoint(0x22)      // gerades ASCII-Quote
const esc = (c) => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')

const DIR = path.join(process.cwd(), 'src', 'content', 'claimondo', 'decoder')
// /OPEN([^STR CLOSE RDQUO]*?)STR/g  -> alles via escaped codepoints
const GERMAN_QUOTE_FIX = new RegExp(
  esc(OPEN) + '([^' + esc(STR) + esc(CLOSE) + esc(RDQUO) + ']*?)' + esc(STR),
  'g',
)
const BLOCK_RE = /(##\s+Schema \(JSON-LD\)\s*```json\s*)([\s\S]*?)(```)/

let fixed = 0
let alreadyOk = 0
const stillBroken = []

for (const name of fs.readdirSync(DIR).filter((n) => n.endsWith('.md'))) {
  const fp = path.join(DIR, name)
  const raw = fs.readFileSync(fp, 'utf8')
  const m = raw.match(BLOCK_RE)
  if (!m) { stillBroken.push(name + ' (kein Schema-Block gefunden)'); continue }
  const original = m[2]
  try { JSON.parse(original.trim()); alreadyOk++; continue } catch { /* repair noetig */ }

  const repaired = original.replace(GERMAN_QUOTE_FIX, OPEN + '$1' + CLOSE)
  try {
    JSON.parse(repaired.trim())
  } catch (e) {
    stillBroken.push(name + ' (nach Fix immer noch invalide: ' + e.message + ')')
    continue
  }
  const next = raw.slice(0, m.index) + m[1] + repaired + m[3] + raw.slice(m.index + m[0].length)
  fs.writeFileSync(fp, next, 'utf8')
  fixed++
  console.log('fixed   ' + name)
}

console.log('\n=== Decoder-Quote-Repair ===')
console.log('repariert:  ' + fixed)
console.log('bereits ok: ' + alreadyOk)
if (stillBroken.length) {
  console.log('NOCH KAPUTT: ' + stillBroken.length)
  stillBroken.forEach((s) => console.log('   - ' + s))
}
process.exit(stillBroken.length === 0 ? 0 : 1)
