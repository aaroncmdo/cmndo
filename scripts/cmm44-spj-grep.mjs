#!/usr/bin/env node
// CMM-44 SP-J — paren-balanced Re-Grep der 11 A+B-Spalten in src/.
//
// Derived from cmm44-sph-grep.mjs. Findet from('faelle')-direct + nested
// faelle(...)-Embeds, die eine der 11 Bucket-A/B-Spalten referenzieren.
// Strips sub-embeds claims:claim_id(...), claims(...), claim_payments(...),
// auftraege(...) als false-positives (die gehoeren bereits zu claims/cp,
// nicht zu faelle-direct).
//
// COLS = 11 A+B (NICHT zahlung_erwartet_am = Bucket C -> separat greppen).
// Bucket A (3, claim_payments-Reroute): zahlung_eingegangen_am, zahlungsweg, zahlung_betrag
// Bucket B (8, claims-ADD):             rest

import fs from 'node:fs'
import path from 'node:path'

const BUCKET_A = new Set(['zahlung_eingegangen_am', 'zahlungsweg', 'zahlung_betrag'])
const COLS = [
  // Bucket A
  'zahlung_eingegangen_am', 'zahlungsweg', 'zahlung_betrag',
  // Bucket B
  'guthaben_verrechnet_netto', 'schlussabrechnung_am',
  'auszahlung_gutachter_betrag', 'auszahlung_gutachter_eingegangen_am',
  'auszahlung_zahlungsweg', 'sv_nachzahlung_netto',
  'abrechnung_id', 'kanzlei_abrechnung_id',
]

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

function stripSubEmbeds(s) {
  // Kommentare raus — Spaltennamen in Migrations-Kommentaren ("liegt jetzt auf
  // claim_payments") sind keine faelle-Zugriffe.
  s = s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  let prev = ''
  while (prev !== s) {
    prev = s
    // splitOrKeepFaelleUpdate({ ... }, claimId) — Bucket-B-Routing NACH claims,
    // kein faelle-Zugriff (der faelle-Teil enthaelt nur faelle-native Spalten).
    s = s.replace(/splitOrKeepFaelleUpdate\(([^()]|\([^()]*\))*\)/g, '')
    // claims:claim_id(...) / claims_xyz:claim_id(...) aliased embeds
    s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
    // plain claims(...) and claim_payments(...) embeds
    s = s.replace(/\bclaim_payments\s*(?::[a-z_]+)?\s*\(([^()]|\([^()]*\))*\)/g, '')
    s = s.replace(/\bclaims\s*(?::[a-z_]+)?\s*\(([^()]|\([^()]*\))*\)/g, '')
    // auftraege(...) sub-embeds
    s = s.replace(/\bauftraege\s*(?::[a-z_]+)?\s*\(([^()]|\([^()]*\))*\)/g, '')
  }
  return s
}

function matchingCols(text) {
  const found = []
  for (const c of COLS) {
    if (new RegExp(`\\b${c}\\b`).test(text)) found.push(c)
  }
  return found
}

function bucketTag(cols) {
  const a = cols.filter((c) => BUCKET_A.has(c))
  const b = cols.filter((c) => !BUCKET_A.has(c))
  const parts = []
  if (a.length) parts.push(`A[${a.join(',')}]`)
  if (b.length) parts.push(`B[${b.join(',')}]`)
  return parts.join(' ')
}

const fromRe = /\.from\(['"]faelle['"]\)/g
const nestedRe = /\bfaelle\s*\(/g
const hits = []

for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')

  let m
  fromRe.lastIndex = 0
  while ((m = fromRe.exec(s))) {
    const window = s.slice(m.index, m.index + 1500)
    const cols = matchingCols(stripSubEmbeds(window))
    if (cols.length) {
      const ln = s.slice(0, m.index).split('\n').length
      hits.push(`${f}:${ln} | ${bucketTag(cols)} | from('faelle') direct`)
    }
  }

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
    const cols = matchingCols(stripSubEmbeds(body))
    if (cols.length) {
      const ln = s.slice(0, m.index).split('\n').length
      hits.push(`${f}:${ln} | ${bucketTag(cols)} | nested faelle(...)`)
    }
  }
}

console.log(hits.join('\n'))
console.log(`\nTOTAL FAELLE-ACCESS HITS: ${hits.length}`)
