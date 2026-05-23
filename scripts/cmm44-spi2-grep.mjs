#!/usr/bin/env node
// CMM-44 SP-I2 — paren-balanced Re-Grep der 11 Spalten in src/.
import fs from 'node:fs'; import path from 'node:path'
const COLS = ['anschlussschreiben_am','anschlussschreiben_url','anschlussschreiben_sendedatum','anschlussschreiben_unterschrift','anschlussschreiben_ocr_am','as_geforderte_summe','as_frist','as_vs_reaktion_text','as_salesforce_id','as_zuletzt_synced_am','mandatsnummer']
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['node_modules','.next','.claude'].includes(e.name)) continue; walk(p, o) } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) o.push(p) } return o }
function strip(s) { let prev = ''; while (prev !== s) { prev = s; s = s.replace(/claims[a-z_]*:claim_id\(([^()]|\([^()]*\))*\)/g, ''); s = s.replace(/\bkanzlei_faelle\s*\(([^()]|\([^()]*\))*\)/g, '') } return s }
const fromRe = /\.from\(['"]faelle['"]\)/g, nestedRe = /\bfaelle\s*\(/g, hits = []
for (const f of walk('src')) { const s = fs.readFileSync(f, 'utf8'); let m
  fromRe.lastIndex = 0; while ((m = fromRe.exec(s))) { const w = strip(s.slice(m.index, m.index + 1800)); for (const c of COLS) if (new RegExp(`\\b${c}\\b`).test(w)) { hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | from('faelle')`); break } }
  nestedRe.lastIndex = 0; while ((m = nestedRe.exec(s))) { const st = m.index + m[0].length; let d = 1, e = st; while (e < s.length && d > 0) { if (s[e] === '(') d++; else if (s[e] === ')') d--; e++ } const w = strip(s.slice(st, e - 1)); for (const c of COLS) if (new RegExp(`\\b${c}\\b`).test(w)) { hits.push(`${f}:${s.slice(0,m.index).split('\n').length} | ${c} | nested faelle(...)`); break } } }
console.log(hits.join('\n')); console.log(`\nTOTAL HITS: ${hits.length}`)
