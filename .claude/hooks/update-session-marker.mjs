#!/usr/bin/env node
// Multi-Session-Awareness-Marker fuer parallele Claude-Code-Sessions.
//
// Schreibt/updatet/loescht eine Datei `current_focus_<session-id>.md` im
// Auto-Memory-Ordner, damit andere parallele Sessions sehen koennen wer
// woran arbeitet (welcher Branch, welche aktuelle Aufgabe, Timestamp).
//
// Aufrufmodi:
//   node update-session-marker.mjs start    # SessionStart: anlegen + andere listen
//   node update-session-marker.mjs prompt   # UserPromptSubmit: aktualisieren + andere als additionalContext
//   node update-session-marker.mjs pre-bash # PreToolUse Bash: bei destructive git-Op warnen wenn andere Session auf MEINEM Branch sitzt
//   node update-session-marker.mjs edit     # PostToolUse Edit|Write: File-Touch loggen
//   node update-session-marker.mjs bash     # PostToolUse Bash: git-Activity loggen
//   node update-session-marker.mjs stop     # Stop: state=inactive
//
// Hook-stdin: JSON mit session_id, tool_input/tool_response/user-prompt etc.
// Wir nutzen aus stdin nur das `prompt`-Feld bei UserPromptSubmit; alles
// andere kommt aus env-vars und git.
//
// Output: stdout = JSON fuer Hook (additionalContext bei SessionStart).
// Niemals throw - Hooks duerfen nicht Claude-Code blockieren.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const MODE = process.argv[2] || 'unknown'
const HOME = os.homedir()
const PROJECT_KEY = 'C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2'
const MEMORY_DIR = path.join(HOME, '.claude', 'projects', PROJECT_KEY, 'memory')

// Session-ID: aus stdin (Hook input) oder env-var, sonst PID.
let stdinJson = {}
try {
  const raw = readFileSync(0, 'utf8')
  if (raw && raw.trim()) stdinJson = JSON.parse(raw)
} catch {
  // stdin leer / kein JSON - ok
}

const sessionId =
  stdinJson.session_id ||
  process.env.CLAUDE_SESSION_ID ||
  `pid-${process.pid}`

const markerPath = path.join(MEMORY_DIR, `current_focus_${sessionId}.md`)

function tryExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const branch = tryExec('git branch --show-current') || '(detached)'
const headSha = tryExec('git rev-parse --short HEAD') || ''
const isoNow = new Date().toISOString()

// Marker-Inhalt aufbauen.
function buildMarker({ state, currentTask, startedAt, touchedFiles = [] }) {
  const filesSection = touchedFiles.length > 0
    ? ['', '## Recently touched files (letzte 10)', '', ...touchedFiles.slice(-10).map((f) => `- \`${f.path}\` (${f.ts})`)]
    : []
  const lines = [
    '---',
    `name: current-focus-${sessionId}`,
    `description: "Aktive Session ${sessionId} (${state})"`,
    'metadata:',
    '  type: project',
    '  ephemeral: true',
    `  session_id: "${sessionId}"`,
    `  state: ${state}`,
    `  branch: "${branch}"`,
    headSha ? `  head_sha: "${headSha}"` : '',
    startedAt ? `  started_at: "${startedAt}"` : '',
    `  last_update: "${isoNow}"`,
    '---',
    '',
    `# Session ${sessionId}`,
    '',
    `**State:** ${state}`,
    `**Branch:** \`${branch}\``,
    headSha ? `**HEAD:** \`${headSha}\`` : '',
    startedAt ? `**Started:** ${startedAt}` : '',
    `**Last update:** ${isoNow}`,
    '',
    '## Current task',
    '',
    currentTask || '(idle)',
    ...filesSection,
    '',
  ].filter(Boolean)
  return lines.join('\n') + '\n'
}

// Existing-Marker einlesen um started_at zu erhalten.
function readExistingStartedAt() {
  if (!existsSync(markerPath)) return null
  try {
    const content = readFileSync(markerPath, 'utf8')
    const m = content.match(/started_at:\s*"([^"]+)"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// Existing touched-files Liste aus markers parsen (fuer append).
function readExistingTouchedFiles() {
  if (!existsSync(markerPath)) return []
  try {
    const content = readFileSync(markerPath, 'utf8')
    const matches = [...content.matchAll(/^- `([^`]+)` \(([^)]+)\)$/gm)]
    return matches.map((m) => ({ path: m[1], ts: m[2] }))
  } catch {
    return []
  }
}

// Existing currentTask aus marker parsen (damit edit-mode nicht ueberschreibt).
function readExistingCurrentTask() {
  if (!existsSync(markerPath)) return null
  try {
    const content = readFileSync(markerPath, 'utf8')
    const m = content.match(/## Current task\s*\n+([^\n]+)/)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

// Liste aktive Marker (state != inactive, last_update <24h alt).
function listActiveOtherMarkers() {
  if (!existsSync(MEMORY_DIR)) return []
  const files = readdirSync(MEMORY_DIR).filter((f) => f.startsWith('current_focus_') && f.endsWith('.md'))
  const now = Date.now()
  const out = []
  for (const f of files) {
    if (f === `current_focus_${sessionId}.md`) continue
    const full = path.join(MEMORY_DIR, f)
    try {
      const content = readFileSync(full, 'utf8')
      const state = content.match(/state:\s*(\w+)/)?.[1] || 'unknown'
      const lastUpdate = content.match(/last_update:\s*"([^"]+)"/)?.[1]
      const branch = content.match(/branch:\s*"([^"]+)"/)?.[1] || ''
      const sid = content.match(/session_id:\s*"([^"]+)"/)?.[1] || f.replace('current_focus_', '').replace('.md', '')
      const ageMs = lastUpdate ? now - new Date(lastUpdate).getTime() : Infinity
      const ageOk = ageMs < 24 * 60 * 60 * 1000
      const taskMatch = content.match(/## Current task\s*\n+([^\n]+)/)
      const task = taskMatch ? taskMatch[1].trim() : ''
      out.push({ sid, state, branch, lastUpdate, ageMs, ageOk, task })
    } catch {
      // ignore
    }
  }
  return out
}

mkdirSync(MEMORY_DIR, { recursive: true })

function emitAdditionalContext(hookEventName) {
  const others = listActiveOtherMarkers().filter((o) => o.ageOk && o.state !== 'inactive')
  if (others.length === 0) return
  const lines = others.map(
    (o) => `- Session \`${o.sid}\` on branch \`${o.branch}\` — ${o.task || '(idle)'} (last update ${o.lastUpdate})`,
  )
  // Branch-Kollisions-Check: arbeitet eine andere Session auf MEINEM Branch?
  const collisions = others.filter((o) => o.branch === branch && branch && branch !== '(detached)')
  let warning = ''
  if (collisions.length > 0) {
    warning =
      `\n\n## BRANCH-KOLLISION! (${collisions.length} andere Sessions auf \`${branch}\`)\n\n` +
      collisions.map((c) => `- Session \`${c.sid}\` — ${c.task || '(idle)'}`).join('\n') +
      `\n\n**Risiko:** working-tree-trampeln, force-push-Konflikte, doppelte Commits.\n` +
      `**Loesung:** wechsle in einen eigenen Worktree:\n` +
      `\`\`\`\nnode scripts/new-session-worktree.mjs <new-branch-slug>\n\`\`\`\n` +
      `Das skript clont in \`.claude/worktrees/session-<short>/\`, du arbeitest dort isoliert und pushst einen eigenen Branch.\n`
  }
  const ctx =
    `# Andere aktive Claude-Code-Sessions (${others.length})\n\n` +
    lines.join('\n') +
    warning +
    `\n\nKoordiniere Branches/Files/Merges damit ihr euch nicht trampelt. Volle Marker mit File-Touch + Git-Activity unter ${MEMORY_DIR}.\n`
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName, additionalContext: ctx },
    }),
  )
}

if (MODE === 'start') {
  const existingStart = readExistingStartedAt()
  const startedAt = existingStart || isoNow
  writeFileSync(
    markerPath,
    buildMarker({ state: 'active', currentTask: '(starting)', startedAt }),
  )
  emitAdditionalContext('SessionStart')
} else if (MODE === 'prompt') {
  const existingStart = readExistingStartedAt()
  const startedAt = existingStart || isoNow
  const promptSnippet = (stdinJson.prompt || '').slice(0, 240).replace(/\r?\n/g, ' ')
  const touched = readExistingTouchedFiles()
  writeFileSync(
    markerPath,
    buildMarker({ state: 'active', currentTask: promptSnippet || '(no prompt)', startedAt, touchedFiles: touched }),
  )
  // KONTINUIERLICHE Awareness: bei jedem User-Prompt sehen wir andere Sessions
  emitAdditionalContext('UserPromptSubmit')
} else if (MODE === 'edit') {
  // PostToolUse Edit|Write: File-Touch loggen, currentTask + startedAt erhalten
  const filePath =
    stdinJson?.tool_response?.filePath ||
    stdinJson?.tool_input?.file_path ||
    stdinJson?.tool_input?.notebook_path ||
    ''
  if (filePath) {
    const existingStart = readExistingStartedAt()
    const startedAt = existingStart || isoNow
    const task = readExistingCurrentTask() || '(idle)'
    const touched = readExistingTouchedFiles()
    // Dedupe: wenn der gleiche File-Pfad ganz zuletzt geloggt wurde, ueberschreibe ts statt append
    const last = touched[touched.length - 1]
    if (last && last.path === filePath) {
      touched[touched.length - 1] = { path: filePath, ts: isoNow }
    } else {
      touched.push({ path: filePath, ts: isoNow })
    }
    writeFileSync(
      markerPath,
      buildMarker({ state: 'active', currentTask: task, startedAt, touchedFiles: touched }),
    )
  }
} else if (MODE === 'pre-bash') {
  // PreToolUse Bash: vor destruktiven git-Ops (push/merge/reset --hard/force) checken
  // ob eine andere aktive Session auf MEINEM Branch sitzt. Wenn ja: additionalContext
  // mit Warnung emitten - blockt nicht, gibt nur Hinweis im Modell-Kontext.
  const cmd = String(stdinJson?.tool_input?.command || '')
  const destructiveRegex =
    /(?:^|[\s;&|])(?:git\s+(?:push(?:\s+(?:-f|--force|--force-with-lease))?|merge|rebase|reset\s+--hard|cherry-pick)|gh\s+pr\s+(?:merge|close))\b/
  if (destructiveRegex.test(cmd) && branch && branch !== '(detached)') {
    const others = listActiveOtherMarkers().filter((o) => o.ageOk && o.state !== 'inactive')
    const collisions = others.filter((o) => o.branch === branch)
    if (collisions.length > 0) {
      const ctx =
        `# ⚠ BRANCH-KOLLISION beim destruktiven git-Befehl\n\n` +
        `Du willst auf \`${branch}\` ausfuehren:\n\`\`\`\n${cmd.slice(0, 200)}\n\`\`\`\n\n` +
        `Aber ${collisions.length} andere Session(s) arbeiten parallel auf demselben Branch:\n` +
        collisions.map((c) => `- \`${c.sid}\` — ${c.task || '(idle)'} (last update ${c.lastUpdate})`).join('\n') +
        `\n\n**Bevor du fortfaehrst:** \`git fetch\` + Stand pruefen, sonst Risiko von force-push-Overwrite oder doppelten Commits.\n`
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: ctx },
        }),
      )
    }
  }
} else if (MODE === 'bash') {
  // PostToolUse Bash: nur git-relevante Aktivitaeten loggen (commit/push/merge/rebase)
  // damit andere Sessions sehen wenn jemand gerade mergen/pushen will.
  const cmd = String(stdinJson?.tool_input?.command || '')
  const gitActivityRegex =
    /(?:^|[\s;&|])(?:git\s+(?:commit|push|merge|rebase|reset\s+--hard|cherry-pick)|gh\s+pr\s+(?:create|merge|edit|reopen|close))\b/
  if (gitActivityRegex.test(cmd)) {
    const existingStart = readExistingStartedAt()
    const startedAt = existingStart || isoNow
    const task = readExistingCurrentTask() || '(idle)'
    const touched = readExistingTouchedFiles()
    // Git-Activity-Eintraege haben Praefix "GIT:" damit sie sich von File-Touches unterscheiden
    const shortCmd = cmd.slice(0, 120).replace(/\r?\n/g, ' ')
    touched.push({ path: `GIT: ${shortCmd}`, ts: isoNow })
    writeFileSync(
      markerPath,
      buildMarker({ state: 'active', currentTask: task, startedAt, touchedFiles: touched }),
    )
  }
} else if (MODE === 'stop') {
  const existingStart = readExistingStartedAt()
  const startedAt = existingStart || isoNow
  const touched = readExistingTouchedFiles()
  writeFileSync(
    markerPath,
    buildMarker({ state: 'inactive', currentTask: '(session ended)', startedAt, touchedFiles: touched }),
  )
}

// Hooks duerfen nicht crashen - immer exit 0
process.exit(0)
