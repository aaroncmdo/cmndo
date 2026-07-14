// Gemeinsame Memory-Logik fuer die Hooks. NEBENWIRKUNGSFREI (nur Exports, kein Auto-Run).
//
// Zwei Consumer:
//   * load-memory-digest.mjs  (SessionStart)      -> buildDigest()  : branch-relevanter Index-Digest
//   * update-session-marker.mjs (UserPromptSubmit) -> recallForPrompt(): IDF-Treffer zum Prompt
//
// WARUM DIE RECALL-LOGIK HIER LIEGT UND NICHT IN EINEM EIGENEN HOOK:
// Ein node-Prozess-Start kostet auf dieser Windows-Kiste ~2.2 s (gemessen: `node -e "0"`,
// 0.0 s CPU — Defender scannt node.exe bei jedem Spawn, verstaerkt durch ~10 parallele
// Sessions). update-session-marker.mjs laeuft ohnehin bei JEDEM Prompt. Ein ZWEITER Hook
// auf UserPromptSubmit wuerde die Prompt-Latenz also ~verdoppeln. Deshalb faehrt der Recall
// im bereits laufenden Prozess mit (+~0.15 s CPU statt +2.2 s Prozess-Start).

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()
const PROJECT_KEY = 'C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2'
export const MEMORY_DIR = path.join(HOME, '.claude', 'projects', PROJECT_KEY, 'memory')
const INDEX = path.join(MEMORY_DIR, 'MEMORY.md')

// --- Digest (SessionStart) ---
const MAX_ENTRIES = 25
const MAX_BYTES = 14000
const DESC_CHARS = 190
// --- Recall (UserPromptSubmit) ---
const RECALL_MAX = 4
const RECALL_BYTES = 2200
const RECALL_DESC = 170
const MIN_SCORE = 3.0        // ~ein einzelner, halbwegs seltener Token-Treffer
const MIN_ENTRY_SCORE = 2.0  // Eintraege darunter fliegen raus
const MAX_PROMPT_TOKENS = 8  // nur die spezifischsten Prompt-Tokens zaehlen
const MIN_IDF = 0.7          // Allerwelts-Tokens (df > ~N/2) raus

// WICHTIG: IDF belohnt SELTENHEIT. Ein Alltagswort, das im (technischen, telegrafischen) Index
// selten vorkommt, bekommt dadurch ein HOHES Gewicht — genau der Fehlerfall: "wie STEHT es um..."
// matchte einen Lead-Workflow-Marker mit idf 6.3. Haeufige Fachwoerter (`prod`, `claim`) filtert
// IDF automatisch raus; gegen seltene ALLTAGSWOERTER hilft nur diese Liste. Daher bewusst
// ausfuehrlich bei Verben/Partikeln, sparsam bei Fachbegriffen.
const STOP = new Set([
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer','eines','dies','diese','dieser','dieses',
  'und','oder','aber','doch','denn','weil','dass','wenn','als','wie','was','wer','wann','warum','wieso','weshalb',
  'welche','welcher','welches','wohin','woher','damit','also','quasi','sowie','etc','bzw','usw',
  'ich','er','sie','wir','ihr','mir','mich','dir','dich','uns','euch','man','mein','dein','sein','ihre',
  'nicht','kein','keine','nur','noch','schon','auch','mal','bitte','danke','ja','nein','okay','sehr','gut','neu',
  'auf','mit','von','zur','zum','bei','aus','nach','ueber','unter','fuer','vor','durch','ohne','gegen','alle','alles',
  'eigentlich','vielleicht','wirklich','einfach','gerade','immer','irgendwie','evtl','ggf','halt','eben','etwas',
  // DE Verben — hier liegt der IDF-Fallstrick (selten im Index -> faelschlich hohes Gewicht)
  'ist','sind','war','waren','hat','habe','haben','hatte','wird','werden','wurde','wurden','kann','koennen','konnte',
  'steht','stehen','geht','gehen','kommt','kommen','liegt','liegen','laeuft','laufen','sieht','sehen','bleibt','bleiben',
  'heisst','heissen','passiert','funktioniert','klappt','braucht','brauchen','will','willst','wollen','moechte',
  'denke','meine','glaube','weiss','wissen','sagt','sagen','findet','finden','gibt','gib','sag','zeig','zeige',
  'mach','machen','macht','bau','bauen','nimm','lass','soll','sollen','muss','muessen','schau','schaue','pruef','pruefe',
  'kaputt','fertig',
  'the','and','but','are','was','were','has','have','had','will','would','can','could','this','that','these','those',
  'with','from','for','into','about','what','how','why','when','where','you','your','our','its','they','their',
  'not','only','also','just','make','build','show','please','yes','does','did','get','got','need','want','see','look',
  'ultrathink','claude','session','weiter','los','dann','jetzt','nochmal','wieder',
])

export const tokenize = (s) =>
  String(s).toLowerCase().split(/[^a-z0-9äöüß_]+/).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t))

const snip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s)

// Vollen Index parsen: `- [<desc>](FILE.md) — <hook>`
export function readIndex() {
  if (!existsSync(INDEX)) return []
  const lines = readFileSync(INDEX, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('- ['))
  return lines.map((line, idx) => {
    // Greedy [\s\S]* trifft den LETZTEN ](*.md)-Link = den Datei-Link.
    const m = line.match(/^- \[([\s\S]*)\]\(([^()]+\.md)\)/)
    const file = m ? m[2] : ''
    const desc = (m ? m[1] : line.slice(2)).replace(/\s+/g, ' ').trim()
    return {
      file,
      desc,
      idx,
      isBroadcast: /^broadcast-/i.test(file),
      isCoord: /^coordination-/i.test(file),
      resolved: /(?:✅|\bRESOLVED\b|\bOBSOLET|\bGELÖST\b|\bGELOEST\b|\berledigt\b|\babgeschlossen\b)/i.test(desc),
    }
  })
}

// ---------------------------------------------------- SessionStart: branch-relevanter Digest
export function buildDigest(entries, branch) {
  const total = entries.length
  if (!total) return ''
  const tokens = tokenize(String(branch).replace(/[/_-]+/g, ' ')).filter((t) => !['kitta', 'aar', 'embed'].includes(t))

  const scored = entries.map((e) => {
    const hay = (e.file + ' ' + e.desc).toLowerCase()
    const matched = tokens.filter((t) => hay.includes(t))
    let score = Math.min(matched.length, 3) * 300          // Lane-Relevanz = staerkster Hebel
    score += Math.max(0, 200 * (1 - e.idx / total))        // Index-Position = Recency-Proxy
    if (e.isBroadcast) score += e.resolved ? 40 : 200      // offene Mandate hoch, erledigte verblassen
    if (e.isCoord) score += 30
    return { ...e, score, matched }
  })
  scored.sort((a, b) => b.score - a.score)

  const header =
    `# 📓 Relevante Memory-Eintraege (Top ${Math.min(MAX_ENTRIES, total)} von ${total}` +
    `${branch ? `, priorisiert fuer \`${branch}\`` : ''})\n\n` +
    `Die eingebaute auto-memory laedt \`MEMORY.md\` nur bis ~24 KB — der Rest des Index faellt\n` +
    `still weg. Dieser Digest surfaced die relevantesten Eintraege (🎯 branch-relevant ·\n` +
    `📢 offener BROADCAST · sonst aktuell), egal wo sie im Index stehen.\n` +
    `**Volltext: \`Read\` das File in \`memory/\`. Vollindex: \`memory/MEMORY.md\`.**\n\n`

  let body = '', shown = 0
  for (const e of scored.slice(0, MAX_ENTRIES)) {
    const tag = e.matched.length ? `🎯(${e.matched.join(',')}) ` : e.isBroadcast ? '📢 ' : ''
    const line = `- ${tag}**${e.file || '(?)'}** — ${snip(e.desc, DESC_CHARS)}\n`
    if (Buffer.byteLength(header + body + line, 'utf8') > MAX_BYTES) break
    body += line; shown++
  }
  const tail = total > shown
    ? `\n_${total - shown} weitere Eintraege im Index — bei Bedarf \`Grep\` \`memory/\` nach Stichwort._\n`
    : ''
  return header + body + tail
}

// ------------------------------------------------- UserPromptSubmit: IDF-Recall zum Prompt
// IDF statt naivem Substring-Match: ein Token in 300 von 537 Eintraegen (`prod`, `claim`) traegt
// KEIN Signal; eines in 8 (`provision`, `nfc`) ist hoch diskriminierend. Score je Eintrag =
// Summe der IDF-Gewichte der enthaltenen Prompt-Tokens. Die Schwelle ist damit selbst-justierend:
// "ja mach das" hat nur Allerwelts-/Stop-Tokens -> nichts ueberschreitet MIN_SCORE -> Stille.
export function buildRecall(entries, prompt, sessionId, { persist = true } = {}) {
  const N = entries.length
  if (!N || !prompt) return ''

  const docTokens = entries.map((e) => new Set(tokenize(e.file + ' ' + e.desc)))
  const df = new Map()
  for (const set of docTokens) for (const t of set) df.set(t, (df.get(t) || 0) + 1)

  const pTokens = [...new Set(tokenize(prompt))]
    .filter((t) => df.has(t))                       // Tokens ohne Vorkommen matchen ohnehin nichts
    .map((t) => ({ t, idf: Math.log(N / df.get(t)) }))
    .filter((x) => x.idf > MIN_IDF)
    .sort((a, b) => b.idf - a.idf)
    .slice(0, MAX_PROMPT_TOKENS)
  if (!pTokens.length) return ''

  const scored = entries
    .map((e, i) => {
      let score = 0
      const hit = []
      for (const { t, idf } of pTokens) if (docTokens[i].has(t)) { score += idf; hit.push(t) }
      return { e, score, hit }
    })
    .filter((x) => x.score >= MIN_ENTRY_SCORE)
    .sort((a, b) => b.score - a.score)
  if (!scored.length || scored[0].score < MIN_SCORE) return ''   // kein echter Treffer -> Stille

  // Dedup je Session: denselben Marker nicht bei jedem Prompt erneut einspielen.
  const statePath = path.join(os.tmpdir(), `claude-memrecall-${String(sessionId).replace(/[^\w-]/g, '')}.json`)
  let seen = []
  if (persist) { try { seen = JSON.parse(readFileSync(statePath, 'utf8')) } catch {} }
  const fresh = scored.filter((x) => !seen.includes(x.e.file)).slice(0, RECALL_MAX)
  if (!fresh.length) return ''

  const used = [...new Set(fresh.flatMap((x) => x.hit))]
  const header =
    `# 🧠 Memory-Treffer zu deinem Prompt (${fresh.length})\n\n` +
    `Passend zu: ${used.map((t) => `\`${t}\``).join(', ')} — evtl. relevant, evtl. nicht.\n` +
    `**Volltext: \`Read\` das File in \`memory/\`.**\n\n`
  let body = ''
  const shownFiles = []
  for (const x of fresh) {
    const line = `- **${x.e.file}** — ${snip(x.e.desc, RECALL_DESC)}\n`
    if (Buffer.byteLength(header + body + line, 'utf8') > RECALL_BYTES) break
    body += line
    shownFiles.push(x.e.file)
  }
  if (!shownFiles.length) return ''
  if (persist) { try { writeFileSync(statePath, JSON.stringify([...seen, ...shownFiles])) } catch {} }
  return header + body
}

// Bequemer, voll gekapselter Einstieg fuer update-session-marker.mjs:
// darf unter KEINEN Umstaenden werfen (der Hook schreibt sonst seinen Session-Marker nicht).
export function recallForPrompt(prompt, sessionId) {
  try {
    return buildRecall(readIndex(), prompt, sessionId, { persist: true })
  } catch {
    return ''
  }
}
