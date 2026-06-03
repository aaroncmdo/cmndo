// CMM-49 — Classifier für `from('faelle')`-Berührungspunkte (READ-ONLY).
//
// Zweck: die ~436 from('faelle')-Stellen in Klassen sortieren, damit wir
// wissen, welche Teilmenge per Codemod SICHER auf resolveClaimId/claims
// umstellbar ist (Pure-Bridge) und welche per-Hand / CMM-63-gated / Embed
// bleiben müssen. Verändert NICHTS — nur Analyse + Histogramm.
//
// Nutzung: node scripts/cmm49-classify-faelle-reads.mjs [--list KLASSE]

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

// ── alle .ts/.tsx unter src sammeln ──────────────────────────────────────────
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p)
  }
  return acc
}

// ── eine from('faelle')-Chain ab Match-Start grob einfangen (bis Terminator) ──
function grabChain(text, idx) {
  // ab idx bis zum nächsten Terminator (single/maybeSingle/then/csv) ODER 600 Zeichen
  const slice = text.slice(idx, idx + 600)
  const term = slice.search(/\.(single|maybeSingle|then|csv|throwOnError)\(/)
  return term >= 0 ? slice.slice(0, term + 20) : slice
}

function firstKey(chain) {
  const m = chain.match(/\.(eq|in|match|filter)\(\s*['"]([a-z_]+)['"]/)
  return m ? m[2] : null
}

function selectArg(chain) {
  // erstes .select('...') ODER .select("...") — nur String-Literal-Arg
  const m = chain.match(/\.select\(\s*([`'"])([\s\S]*?)\1/)
  return m ? m[2].replace(/\s+/g, ' ').trim() : null
}

const CLASSES = {
  WRITER: [],        // insert/update/delete/upsert → DROP-Blocker, per Hand
  PURE_BRIDGE: [],   // select('claim_id').eq('id', x) → resolveClaimId (codemod-safe)
  EMBED: [],         // claims:claim_id(...) Embed → per Hand (Embed erhalten)
  KUNDE_ID: [],      // liest kunde_id → CMM-63-gated
  ANCHOR: [],        // .eq('claim_id', x) → faelle BY claim (reverse) → from('claims')
  KEY_OTHER: [],     // gekeyt per lead_id/kennzeichen/etc.
  EXISTENCE: [],     // select('id') Existenz/Ownership-Check
  OTHER: [],         // unklassifiziert → manuell ansehen
}

const files = walk(SRC)
let total = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  const re = /\.from\(\s*['"]faelle['"]\s*\)/g
  let m
  while ((m = re.exec(text)) !== null) {
    total++
    const chain = grabChain(text, m.index)
    const line = text.slice(0, m.index).split('\n').length
    const where = `${rel}:${line}`

    // Writer?
    if (/\.from\(\s*['"]faelle['"]\s*\)\s*\.(insert|update|delete|upsert)\(/.test(chain)) {
      CLASSES.WRITER.push(where); continue
    }
    const sel = selectArg(chain)
    const key = firstKey(chain)
    const hasEmbed = sel != null && /claims\s*:|:\s*claim_id\s*\(/.test(sel)
    const hasKundeId = sel != null && /\bkunde_id\b/.test(sel)

    if (hasEmbed) { CLASSES.EMBED.push(`${where}  [${sel}]`); continue }
    if (hasKundeId) { CLASSES.KUNDE_ID.push(`${where}  [${sel}]`); continue }
    if (key === 'claim_id') { CLASSES.ANCHOR.push(`${where}  [sel=${sel}]`); continue }
    if (sel === 'claim_id' && key === 'id') { CLASSES.PURE_BRIDGE.push(where); continue }
    if (key && key !== 'id') { CLASSES.KEY_OTHER.push(`${where}  [key=${key} sel=${sel}]`); continue }
    if (sel === 'id') { CLASSES.EXISTENCE.push(where); continue }
    CLASSES.OTHER.push(`${where}  [sel=${sel} key=${key}]`)
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const listClass = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null
console.log(`\n=== CMM-49 from('faelle')-Klassifikation ===  (total ${total})\n`)
for (const [name, arr] of Object.entries(CLASSES)) {
  console.log(`${name.padEnd(12)} ${String(arr.length).padStart(4)}`)
}
console.log('')
if (listClass && CLASSES[listClass]) {
  console.log(`--- ${listClass} (${CLASSES[listClass].length}) ---`)
  for (const e of CLASSES[listClass]) console.log('  ' + e)
}
