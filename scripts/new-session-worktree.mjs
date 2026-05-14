#!/usr/bin/env node
// Helper: legt einen isolierten Git-Worktree fuer eine neue Claude-Code-Session
// an, sodass parallele Sessions sich nicht mehr im selben Working-Tree
// trampeln koennen.
//
// Verwendung:
//   node scripts/new-session-worktree.mjs <branch-slug> [base-branch]
//
// Beispiele:
//   node scripts/new-session-worktree.mjs aar-cj-iter4-smoke
//     -> legt Branch kitta/aar-cj-iter4-smoke an, branched von origin/main
//     -> Worktree-Pfad: .claude/worktrees/aar-cj-iter4-smoke/
//
//   node scripts/new-session-worktree.mjs aar-880-foo staging
//     -> Branch kitta/aar-880-foo, branched von origin/staging
//
// Nach Anlegen: Aaron startet eine neue Claude-Code-Instanz im Worktree-Pfad.
// Dadurch bekommt diese Session ein komplett isoliertes Working-Tree —
// keine Konflikte mehr mit anderen parallelen Sessions.

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const slug = process.argv[2]
const baseRef = process.argv[3] || 'main'

if (!slug) {
  console.error('Usage: node scripts/new-session-worktree.mjs <branch-slug> [base-branch]')
  console.error('  branch-slug: ohne kitta/-Praefix, z.B. "aar-cj-iter4-smoke"')
  console.error('  base-branch: default "main", z.B. "staging" fuer staging-basiert')
  process.exit(1)
}

const fullBranch = slug.startsWith('kitta/') ? slug : `kitta/${slug}`
const worktreeName = slug.replace(/^kitta\//, '').replace(/[^a-zA-Z0-9-_]/g, '-')
const worktreePath = path.join('.claude', 'worktrees', worktreeName)

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: opts.silent ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
}

// Pre-Checks
if (existsSync(worktreePath)) {
  console.error(`✗ Worktree-Pfad existiert bereits: ${worktreePath}`)
  console.error('  Bitte einen anderen Slug verwenden oder mit "git worktree remove" entfernen.')
  process.exit(1)
}

console.log(`→ Fetch origin ${baseRef}...`)
try {
  sh(`git fetch origin ${baseRef}`, { silent: true })
} catch {
  console.error(`✗ git fetch origin ${baseRef} fehlgeschlagen`)
  process.exit(1)
}

// Branch existiert schon?
let branchExists = false
try {
  sh(`git rev-parse --verify ${fullBranch}`, { silent: true })
  branchExists = true
} catch {
  branchExists = false
}

if (branchExists) {
  console.log(`→ Branch ${fullBranch} existiert — Worktree wird auf existierenden Branch zeigen`)
  sh(`git worktree add "${worktreePath}" "${fullBranch}"`)
} else {
  console.log(`→ Branch ${fullBranch} neu erstellt aus origin/${baseRef}`)
  sh(`git worktree add -b "${fullBranch}" "${worktreePath}" "origin/${baseRef}"`)
}

console.log('')
console.log(`✓ Worktree angelegt: ${worktreePath}`)
console.log(`✓ Branch: ${fullBranch}`)
console.log('')
console.log('Naechste Schritte:')
console.log(`  1. Neue Claude-Code-Instanz starten:`)
console.log(`     cd "${worktreePath}" && claude`)
console.log('')
console.log(`  2. Wenn fertig, Worktree aufraeumen:`)
console.log(`     git worktree remove "${worktreePath}"`)
console.log('')
console.log(`Tipp: gleichzeitige Sessions im gleichen Repo koennen sich jetzt nicht mehr im`)
console.log(`Working-Tree trampeln — jeder Worktree hat sein eigenes \`src/\`, eigenen Branch-State, etc.`)
