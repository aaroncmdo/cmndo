#!/usr/bin/env node
// CMM-44 SP-G — paren-balanced Re-Grep der 19 SP-G-Spalten in src/.
//
// Vermeidet die Stolperfallen aus SP-B/A2:
// - Multi-line `from('faelle').select(...)` Blöcke (Spalten-Name auf separater Zeile)
// - Doppelt-genestete `faelle(...)`-Embeds
// - Sub-Embeds `claims:claim_id(...)` / `gutachten(...)` als false-positive ausschließen
//
// Output: pro Treffer eine Zeile `Datei:Zeile | Spalte | Muster`. Muster sind
// die Klassifizierung aus dem Plan-Header (A-G), hier vorsortiert:
// - "from('faelle') direct"   = Pattern A oder B (Direkt-Select)
// - "nested faelle(...)"      = Pattern D (von anderer Tabelle aus)
// - "Klasse-C property access" = Pattern F für gutachten_vorhanden/_stundensatz/nutzungsausfall_gesamt

import fs from 'node:fs'
import path from 'node:path'

const COLS = [
  // 11 Klasse-A (1:1 Rename)
  'gutachten_eingegangen_am','gutachten_betrag','gutachter_honorar',
  'ocr_extrahiert_am','ocr_rohdaten','gutachten_hochgeladen_am',
  'gutachten_nummer','reparaturkosten','wertminderung',
  'nutzungsausfall_tagessatz','reparaturdauer_tage',
  // 5 Klasse-B (PR1 ADD)
  'ki_kalkulation','ki_kalkulation_am','ki_geschaetzte_kosten_min',
  'ki_geschaetzte_kosten_max','gutachten_positionen',
  // 3 Klasse-C (Reader-Umstellung)
  'gutachten_vorhanden','gutachten_stundensatz','nutzungsausfall_gesamt',
]
const KLASSE_C = new Set(['gutachten_vorhanden','gutachten_stundensatz','nutzungsausfall_gesamt'])

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '.claude') continue
      walk(p, out)
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p)
  }
  return out
}

// strip nested embed sub-bodies so an SP-G column INSIDE a `claims:claim_id(...)` or
// `gutachten(...)` sub-embed does NOT count as a live faelle-side reference.
function stripSubEmbeds(s) {
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
    s = s.replace(/\bgutachten\s*\(([^()]|\([^()]*\))*\)/g, '')
  }
  return s
}

const fromRe = /\.from\(['"]faelle['"]\)/g
const nestedRe = /\bfaelle\s*\(/g
const hits = []

for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')

  // (1) Direkt-from('faelle'): 1500-char Fenster ab Treffer
  let m
  fromRe.lastIndex = 0
  while ((m = fromRe.exec(s))) {
    const window = s.slice(m.index, m.index + 1500)
    const stripped = stripSubEmbeds(window)
    for (const c of COLS) {
      const re = new RegExp(`\\b${c}\\b`)
      if (re.test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        hits.push(`${f}:${ln} | ${c} | from('faelle') direct`)
        break
      }
    }
  }

  // (2) Nested `faelle(...)`-Embed (von anderer Tabelle): paren-balanced Body extrahieren
  nestedRe.lastIndex = 0
  while ((m = nestedRe.exec(s))) {
    const start = m.index + m[0].length
    let depth = 1, end = start
    while (end < s.length && depth > 0) {
      const ch = s[end]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      end++
    }
    const body = s.slice(start, end - 1)
    const stripped = stripSubEmbeds(body)
    for (const c of COLS) {
      const re = new RegExp(`\\b${c}\\b`)
      if (re.test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        hits.push(`${f}:${ln} | ${c} | nested faelle(...)`)
        break
      }
    }
  }

  // (3) Klasse-C Property-Access (fall?.gutachten_vorhanden / fall.gutachten_stundensatz / fall?.nutzungsausfall_gesamt)
  for (const c of KLASSE_C) {
    const re = new RegExp(`\\b\\w+\\??\\.${c}\\b`, 'g')
    let prop
    while ((prop = re.exec(s))) {
      const ln = s.slice(0, prop.index).split('\n').length
      hits.push(`${f}:${ln} | ${c} | Klasse-C property access (${prop[0]})`)
    }
  }
}

console.log(hits.join('\n'))
console.log(`\nTOTAL HITS: ${hits.length}`)
