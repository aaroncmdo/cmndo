#!/usr/bin/env node
// CMM-44 SP-G2 — findet alle gutachter_termine INSERT/upsert-Sites und prueft,
// ob claim_id im Insert-Payload steht. Paren-balanced fuer multi-line Chains
// (.from('gutachter_termine')\n.insert({...})).

import fs from 'node:fs'
import path from 'node:path'

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

// Liest ab einer Position die balancierte (...) ab.
function balanced(s, openIdx) {
  let depth = 0, i = openIdx
  for (; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') { depth--; if (depth === 0) return s.slice(openIdx, i + 1) }
  }
  return s.slice(openIdx)
}

const fromRe = /\.from\(\s*['"]gutachter_termine['"]\s*\)/g
const rows = []

for (const f of walk('src')) {
  const s = fs.readFileSync(f, 'utf8')
  let m
  fromRe.lastIndex = 0
  while ((m = fromRe.exec(s))) {
    const win = s.slice(m.index, m.index + 600)
    const opMatch = win.match(/\.(insert|upsert)\s*\(/)
    if (!opMatch) continue
    const op = opMatch[1]
    const payloadStart = m.index + opMatch.index + opMatch[0].length - 1
    const payload = balanced(s, payloadStart)
    const hasClaimId = /\bclaim_id\s*:/.test(payload)
    const ln = s.slice(0, m.index).split('\n').length
    rows.push(`${f}:${ln} | ${op} | claim_id:${hasClaimId ? 'YES' : 'NO'}`)
  }
}

console.log(rows.join('\n'))
console.log(`\nTOTAL INSERT/UPSERT SITES: ${rows.length}`)
console.log(`MISSING claim_id: ${rows.filter(r => r.endsWith('NO')).length}`)
