#!/usr/bin/env node
// CMM-44 SP-H — paren-balanced Re-Grep der 18 SP-H-Spalten in src/.
//
// Vermeidet die SP-G-Stolperfalle "Multi-line from('faelle')" und
// "doppelt-genestete faelle(...)"-Embeds. Schliesst claims:claim_id(...)
// und auftraege(...)-Sub-Embeds als false-positives aus.

import fs from 'node:fs'
import path from 'node:path'

const COLS = [
  'filmcheck_ok', 'filmcheck_am', 'filmcheck_notizen',
  'storniert_am', 'storno_grund', 'storno_durch_user_id',
  'besichtigung_gestartet_am',
  'sv_briefing_text', 'sv_briefing_generated_at', 'sv_briefing_model',
  'sv_briefing_version', 'sv_briefing_struktur', 'sv_notizen_vor_ort',
  'technische_stellungnahme_status', 'technische_stellungnahme_notiz_sv',
  'technische_stellungnahme_beauftragt_am', 'technische_stellungnahme_hochgeladen_am',
  'technische_stellungnahme_freigabe_am',
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
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, '')
    s = s.replace(/\bauftraege\s*\(([^()]|\([^()]*\))*\)/g, '')
  }
  return s
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
}

console.log(hits.join('\n'))
console.log(`\nTOTAL HITS: ${hits.length}`)
