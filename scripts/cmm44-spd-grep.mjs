#!/usr/bin/env node
// CMM-44 SP-D — paren-balanced Grep der 25 Termin-Cluster-Spalten in src/.
//
// Findet faelle-seitige Zugriffe (from('faelle') + nested faelle(...)) auf:
// - 23 ADD-Spalten (gleicher Name auf gutachter_termine)
// - 2 DUP-Spalten: geschaetzte_fahrzeit_min → geschaetzte_fahrtzeit_min
//                  gcal_event_id            → google_event_id
//
// Sub-Embeds claims:claim_id(...) und gutachter_termine(...) werden gestripped,
// damit Spalten-Namen die IN einem GT-Embed vorkommen keine False-Positives erzeugen.
//
// Output: pro Treffer eine Zeile `Datei:Zeile | Spalte | Muster`

import fs from 'node:fs'
import path from 'node:path'

const COLS = [
  // ADD (23 — gleicher Name auf gutachter_termine)
  'besichtigungsort_adresse',
  'besichtigungsort_lat',
  'besichtigungsort_lng',
  'besichtigungsort_place_id',
  'besichtigungsort_notiz',
  'geschaetzte_fahrdistanz_km',
  'termin_erinnerung_5min_gesendet',
  'sv_termin_dokument_reminder_gesendet_am',
  'losfahren_erinnerung_gesendet',
  'wunschtermin',
  'no_show_gemeldet_am',
  're_termin_token',
  're_termin_token_eingelaufen_am',
  're_termin_eskalation_an_kb_am',
  'nachbesichtigung_status',
  'nachbesichtigung_angefordert_am',
  'nachbesichtigung_termin_datum',
  'nachbesichtigung_konfrontation',
  'nachbesichtigung_ergebnis',
  'nachbesichtigung_kunde_termin_vorschlaege',
  'nachbesichtigung_kunde_termin_eingereicht_am',
  'nachbesichtigung_sv_konfrontation_gewuenscht',
  'nachbesichtigung_sv_termin_vereinbart_am',
  // DUP (2 — Reader-Switch auf bestehende GT-Spalte)
  'geschaetzte_fahrzeit_min',   // → geschaetzte_fahrtzeit_min (Tippfehler-Zwilling)
  'gcal_event_id',              // → google_event_id
]

const DUP_COLS = new Set(['geschaetzte_fahrzeit_min', 'gcal_event_id'])

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.claude'].includes(e.name)) continue
      walk(p, out)
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p)
  }
  return out
}

// Strip nested sub-embed bodies so column names INSIDE a claims:claim_id(...)
// or gutachter_termine(...) sub-embed don't fire as faelle-side references.
function stripSubEmbeds(s) {
  let prev = ''
  while (prev !== s) {
    prev = s
    // claims:claim_id(...) — handles aliases like claims:claim_id(...)
    s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
    // gutachter_termine(...) nested embed
    s = s.replace(/\bgutachter_termine\s*\(([^()]|\([^()]*\))*\)/g, '')
  }
  return s
}

const fromRe = /\.from\(['"]faelle['"]\)/g
const nestedRe = /\bfaelle\s*\(/g
const hits = []

for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')

  // (1) Direct from('faelle'): 1500-char window from match
  let m
  fromRe.lastIndex = 0
  while ((m = fromRe.exec(s))) {
    const window = s.slice(m.index, m.index + 1500)
    const stripped = stripSubEmbeds(window)
    for (const c of COLS) {
      if (new RegExp(`\\b${c}\\b`).test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        const kind = DUP_COLS.has(c) ? 'from(\'faelle\') DUP' : 'from(\'faelle\')'
        hits.push(`${f}:${ln} | ${c} | ${kind}`)
        break
      }
    }
  }

  // (2) Nested faelle(...) embed (from another table): paren-balanced body
  nestedRe.lastIndex = 0
  while ((m = nestedRe.exec(s))) {
    let depth = 1
    let end = m.index + m[0].length
    while (end < s.length && depth > 0) {
      if (s[end] === '(') depth++
      else if (s[end] === ')') depth--
      end++
    }
    const body = s.slice(m.index + m[0].length, end - 1)
    const stripped = stripSubEmbeds(body)
    for (const c of COLS) {
      if (new RegExp(`\\b${c}\\b`).test(stripped)) {
        const ln = s.slice(0, m.index).split('\n').length
        const kind = DUP_COLS.has(c) ? 'nested faelle(...) DUP' : 'nested faelle(...)'
        hits.push(`${f}:${ln} | ${c} | ${kind}`)
        break
      }
    }
  }
}

console.log(hits.join('\n'))
console.log(`\nTOTAL: ${hits.length}`)
