#!/usr/bin/env node
// Liest alle aktiven `current_focus_<id>.md`-Marker und legt fuer jede Session
// einen Worktree-Slot an. Der Worktree zeigt auf den Branch der Session.
//
// Verwendung:
//   node scripts/prepare-worktrees-from-sessions.mjs [--dry]
//
// Output: eine Tabelle mit (Session-ID, Branch, Worktree-Pfad, Status).
// Aaron stoppt dann jede Claude-Tab einzeln und startet neu im jeweiligen
// Worktree-Pfad — danach laufen alle Sessions isoliert.

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DRY = process.argv.includes('--dry')
const HOME = os.homedir()
const PROJECT_KEY = 'C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2'
const MEMORY_DIR = path.join(HOME, '.claude', 'projects', PROJECT_KEY, 'memory')
const WORKTREE_BASE = path.join('.claude', 'worktrees')

mkdirSync(WORKTREE_BASE, { recursive: true })

function sh(cmd, silent = true) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: silent ? ['ignore', 'pipe', 'pipe'] : 'inherit' }).trim()
  } catch (err) {
    return { error: err.message || String(err) }
  }
}

// Aktive Marker einlesen
const files = readdirSync(MEMORY_DIR).filter((f) => f.startsWith('current_focus_') && f.endsWith('.md'))
const sessions = []
for (const f of files) {
  const content = readFileSync(path.join(MEMORY_DIR, f), 'utf8')
  const sid = content.match(/session_id:\s*"([^"]+)"/)?.[1]
  const branch = content.match(/branch:\s*"([^"]+)"/)?.[1]
  const state = content.match(/state:\s*(\w+)/)?.[1]
  const lastUpdate = content.match(/last_update:\s*"([^"]+)"/)?.[1]
  if (!sid || !branch || branch === '(detached)') continue
  if (state === 'inactive') continue
  sessions.push({ sid, branch, state, lastUpdate, file: f })
}

// Branch-Worktree-Zuordnung — wenn mehrere Sessions auf dem gleichen Branch
// sitzen, muessen wir entweder neue Branches pro Session anlegen oder die
// Worktrees teilen sich den Branch (nicht moeglich in Vanilla-Git).
// → Wir nummerieren bei Kollisionen.
const branchToWorktrees = new Map()
for (const s of sessions) {
  if (!branchToWorktrees.has(s.branch)) branchToWorktrees.set(s.branch, [])
  branchToWorktrees.get(s.branch).push(s)
}

console.log(`\n${DRY ? '[DRY] ' : ''}Aktive Sessions: ${sessions.length}\n`)

// Existing worktrees lesen
const existingWorktrees = sh('git worktree list --porcelain')
const existingPaths = new Set()
const existingBranches = new Set()
if (typeof existingWorktrees === 'string') {
  for (const line of existingWorktrees.split('\n')) {
    if (line.startsWith('worktree ')) existingPaths.add(line.slice(9).trim().replace(/\\/g, '/'))
    if (line.startsWith('branch ')) existingBranches.add(line.slice(7).trim().replace(/^refs\/heads\//, ''))
  }
}

const actions = []
for (const [branch, sessList] of branchToWorktrees.entries()) {
  if (sessList.length === 1) {
    const s = sessList[0]
    const slug = branch.replace(/^kitta\//, '').replace(/[^a-zA-Z0-9-_]/g, '-')
    const wtPath = path.join(WORKTREE_BASE, slug).replace(/\\/g, '/')
    if (existingPaths.has(wtPath)) {
      actions.push({ session: s.sid, branch, wtPath, action: 'exists', cmd: null })
      continue
    }
    if (existingBranches.has(branch)) {
      // Branch ist in einem anderen Worktree (z.B. dem main-tree) gecheckt
      actions.push({
        session: s.sid,
        branch,
        wtPath,
        action: 'branch-busy',
        cmd: null,
        note: `Branch ist im Haupt-Tree gecheckt — Haupt-Tree muss zuerst auf anderen Branch wechseln`,
      })
      continue
    }
    const cmd = `git worktree add "${wtPath}" "${branch}"`
    actions.push({ session: s.sid, branch, wtPath, action: 'create', cmd })
  } else {
    // Mehrere Sessions auf gleichem Branch → Sessions bekommen je einen Branch mit Suffix
    sessList.forEach((s, i) => {
      const shortId = s.sid.slice(0, 8)
      const newBranch = `${branch}-s${shortId}`
      const slug = newBranch.replace(/^kitta\//, '').replace(/[^a-zA-Z0-9-_]/g, '-')
      const wtPath = path.join(WORKTREE_BASE, slug).replace(/\\/g, '/')
      if (existingPaths.has(wtPath)) {
        actions.push({ session: s.sid, branch: newBranch, wtPath, action: 'exists', cmd: null })
        return
      }
      const cmd = `git worktree add -b "${newBranch}" "${wtPath}" "${branch}"`
      actions.push({ session: s.sid, branch: newBranch, wtPath, action: 'create-fork', cmd })
    })
  }
}

// Aktionen ausfuehren
for (const a of actions) {
  if (a.action === 'exists') {
    console.log(`✓ [skip] session ${a.session.slice(0, 8)} → ${a.wtPath} (existiert bereits)`)
  } else if (a.action === 'branch-busy') {
    console.log(`⚠ [busy] session ${a.session.slice(0, 8)} → branch \`${a.branch}\` ist im Haupt-Tree`)
    console.log(`         ${a.note}`)
  } else {
    if (DRY) {
      console.log(`[DRY] would run: ${a.cmd}`)
    } else {
      console.log(`→ ${a.action}: ${a.cmd}`)
      const r = sh(a.cmd, false)
      if (typeof r === 'object' && r.error) {
        console.log(`  ✗ ${r.error}`)
      } else {
        console.log(`  ✓ done`)
      }
    }
  }
}

// Migration-Anleitung
console.log('\n--- Migration-Plan ---')
console.log('Fuer jede laufende Claude-Code-Session: schliesse den Tab, oeffne neuen Terminal,')
console.log('wechsle in den jeweiligen Worktree-Pfad und starte Claude neu:\n')

for (const a of actions) {
  if (a.action === 'branch-busy') continue
  console.log(`Session ${a.session.slice(0, 8)} (branch ${a.branch}):`)
  console.log(`  cd "${a.wtPath}"`)
  console.log(`  claude`)
  console.log('')
}

console.log('Sobald alle Sessions im Worktree laufen, kann der Haupt-Tree fuer "neutrale" Aktionen')
console.log('genutzt werden (z.B. dieser Hub-Tab fuer Koordination).')
