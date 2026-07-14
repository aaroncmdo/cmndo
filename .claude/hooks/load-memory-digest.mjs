#!/usr/bin/env node
// SessionStart-Hook: injiziert eine RELEVANZ-gerankte Memory-Digest als additionalContext.
//
// WARUM
// Die eingebaute auto-memory laedt `MEMORY.md` nur bis ~24 KB — der Rest faellt still weg.
// Der Index hat ~530 Eintraege / >300 KB, d.h. beim Load sind ~90 % unsichtbar — inklusive
// evtl. genau der Marker, die fuer DEN AKTUELLEN BRANCH relevant sind (die stehen irgendwo
// in der Mitte des Index und werden nie geladen).
//
// Dieser Hook ERSETZT die eingebaute Ladung nicht, er ERGAENZT sie: er liest den VOLLEN Index
// (1 File-Read), rankt alle Eintraege (branch-relevant > offener BROADCAST > aktuell) und
// surfaced die Top-N als bounded Digest — egal wo sie im Index stehen. Damit sieht jede
// Session automatisch ihre Lane-Marker.
//
// Ranking:
//   +300 je Branch-Token-Treffer (max 3)  -> Lane-Relevanz ist der staerkste Hebel
//   +200 Recency (Position im Index; neue Eintraege werden oben eingefuegt)
//   +200 offener BROADCAST (nur +40 wenn als erledigt markiert) -> globale Mandate bleiben
//        sichtbar, aber ein RESOLVED-Broadcast verdraengt keinen heutigen Lane-Marker
//   +30  COORDINATION-Marker (Koordination > Referenz)
//
// Perf: bewusst NUR MEMORY.md parsen (1 Read, ~0.3 s) statt ~930 Topic-Files zu statten/oeffnen
// (das kostete auf diesem Windows-FS 3-5 s pro SessionStart).
//
// Tuning/Dry-Run: `node .claude/hooks/load-memory-digest.mjs <branch>` druckt den Digest als
// Klartext (statt Hook-JSON) fuer einen beliebigen Branch.
//
// Niemals throw, immer exit 0 (ein Hook darf Claude Code nie blockieren).

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()
const PROJECT_KEY = 'C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2'
const MEMORY_DIR = path.join(HOME, '.claude', 'projects', PROJECT_KEY, 'memory')
const INDEX = path.join(MEMORY_DIR, 'MEMORY.md')

const TEST_BRANCH = process.argv[2] || null
const MAX_ENTRIES = 25
const MAX_BYTES = 14000
const DESC_CHARS = 190
const STOP = new Set(['kitta', 'fix', 'feat', 'aar', 'the', 'und', 'der', 'die', 'das', 'v2', 'embed', 'neu'])

function tryExec(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

function branchTokens(branch) {
  return branch.toLowerCase().split(/[/_\-\s]+/).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))
}

function main() {
  if (!existsSync(INDEX)) return
  const branch = TEST_BRANCH || tryExec('git branch --show-current') || ''
  const tokens = branchTokens(branch)

  const lines = readFileSync(INDEX, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('- ['))
  const total = lines.length
  if (total === 0) return

  const entries = []
  lines.forEach((line, idx) => {
    // `- [<desc, kann selbst [..] und (..) enthalten>](FILE.md) — <hook>`
    // Greedy [\s\S]* trifft den LETZTEN ](*.md)-Link = den Datei-Link.
    const m = line.match(/^- \[([\s\S]*)\]\(([^()]+\.md)\)/)
    const file = m ? m[2] : ''
    const desc = (m ? m[1] : line.slice(2)).replace(/\s+/g, ' ').trim()
    const hay = (file + ' ' + desc).toLowerCase()

    const isBroadcast = /^broadcast-/i.test(file)
    const isCoord = /^coordination-/i.test(file)
    const resolved = /(?:✅|\bRESOLVED\b|\bOBSOLET|\bGELÖST\b|\bGELOEST\b|\berledigt\b|\babgeschlossen\b)/i.test(desc)
    const matched = tokens.filter((t) => hay.includes(t))

    let score = 0
    score += Math.min(matched.length, 3) * 300
    score += Math.max(0, 200 * (1 - idx / total))          // Position = Recency-Proxy (oben = neu)
    if (isBroadcast) score += resolved ? 40 : 200
    if (isCoord) score += 30
    entries.push({ file, desc, score, matched, isBroadcast })
  })

  entries.sort((a, b) => b.score - a.score)

  const header = [
    `# 📓 Relevante Memory-Eintraege (Top ${Math.min(MAX_ENTRIES, total)} von ${total}${branch ? `, priorisiert fuer \`${branch}\`` : ''})`,
    ``,
    `Die eingebaute auto-memory laedt \`MEMORY.md\` nur bis ~24 KB — der Rest des Index faellt`,
    `still weg. Dieser Digest surfaced die relevantesten Eintraege (🎯 branch-relevant ·`,
    `📢 offener BROADCAST · sonst aktuell), egal wo sie im Index stehen.`,
    `**Volltext: \`Read\` das File in \`memory/\`. Vollindex: \`memory/MEMORY.md\`.**`,
    ``,
  ].join('\n')

  let body = ''
  let shown = 0
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    const tag = e.matched.length ? `🎯(${e.matched.join(',')}) ` : e.isBroadcast ? '📢 ' : ''
    const snip = e.desc.length > DESC_CHARS ? e.desc.slice(0, DESC_CHARS) + '…' : e.desc
    const line = `- ${tag}**${e.file || '(?)'}** — ${snip}\n`
    if (Buffer.byteLength(header + body + line, 'utf8') > MAX_BYTES) break
    body += line
    shown++
  }
  const tail = total > shown
    ? `\n_${total - shown} weitere Eintraege im Index — bei Bedarf \`Grep\` \`memory/\` nach Stichwort._\n`
    : ''
  const ctx = header + body + tail

  if (TEST_BRANCH) {
    process.stderr.write(`[dry-run] branch=${branch} tokens=[${tokens}] indexEntries=${total} shown=${shown} bytes=${Buffer.byteLength(ctx, 'utf8')}\n`)
    process.stdout.write(ctx)
    return
  }
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }))
}

try { main() } catch {}
process.exit(0)
