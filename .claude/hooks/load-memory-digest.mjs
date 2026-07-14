#!/usr/bin/env node
// SessionStart-Hook: injiziert einen RELEVANZ-gerankten Digest des VOLLEN Memory-Index.
//
// WARUM: die eingebaute auto-memory laedt `MEMORY.md` nur bis ~24 KB — der Rest faellt still
// weg. Der Index hat >530 Eintraege / >300 KB, d.h. ~90 % sind beim Load unsichtbar, ausgerechnet
// inkl. der Marker der EIGENEN Lane (die stehen mitten im Index). Das Cap laesst sich per settings
// NICHT hochsetzen (kein Key im Schema). Also: nicht kleiner machen, sondern gezielter laden.
//
// Der PROMPT-Recall (IDF-Treffer zum jeweiligen Prompt) laeuft NICHT hier, sondern in
// update-session-marker.mjs — der Prozess laeuft bei jedem Prompt ohnehin. Grund: ein
// node-Start kostet auf dieser Kiste ~2.2 s; ein zweiter Hook auf UserPromptSubmit wuerde die
// Prompt-Latenz verdoppeln. Details in memory-lib.mjs.
//
// Logik liegt in memory-lib.mjs (nebenwirkungsfrei, von beiden Hooks geteilt).
//
// Dry-Run / Tuning:
//   node .claude/hooks/load-memory-digest.mjs --dry-branch kitta/<branch>
//   node .claude/hooks/load-memory-digest.mjs --dry-recall "was war mit den provisionen"
//
// Niemals throw, immer exit 0 (ein Hook darf Claude Code nie blockieren).

import { execSync } from 'node:child_process'
import { readIndex, buildDigest, buildRecall } from './memory-lib.mjs'

function tryExec(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

function main() {
  const arg = process.argv[2] || ''
  const entries = readIndex()
  if (!entries.length) return

  // --- Dry-Runs (Tuning, kein Hook-JSON sondern Klartext) ---
  if (arg === '--dry-branch') {
    process.stdout.write(buildDigest(entries, process.argv[3] || ''))
    return
  }
  if (arg === '--dry-recall') {
    const ctx = buildRecall(entries, process.argv[3] || '', 'dry', { persist: false })
    process.stdout.write(ctx || '(kein Treffer — Stille)\n')
    return
  }

  // --- SessionStart ---
  const ctx = buildDigest(entries, tryExec('git branch --show-current') || '')
  if (!ctx) return
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }),
  )
}

try { main() } catch {}
process.exit(0)
