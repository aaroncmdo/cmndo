// Pure Scan-Logik fuer check:operative-status-writes (FG1-Ratchet). Keine I/O -> unit-testbar.
// CLI-Wrapper: ../check-operative-status-writes.mjs
//
// Faengt DIREKTE Writes auf claims.operative_status (.from('claims').update(...) mit
// operative_status im Payload) AUSSERHALB der State-Machine-Engine. Ein solcher Direkt-Write
// umgeht transitionFallStatus -> KEIN fall.status_changed-Event, KEINE Timeline, KEINE
// phase_transitions. Genau diese Klasse erzeugte den Werkstatt-Abschluss-Bypass (17.07.):
// der Abschluss war fuer KB/Admin/Flottenmanager unsichtbar. Single-Writer-Funnel = die
// Engine (state-machine.ts) ist der einzige legitime operative_status-Writer; dokumentierte
// Cursor-Ausnahmen (endzustand-actions.ts) stehen in der Allowlist des Wrappers.
//
// Anker-Praezision: NUR `.from('claims').update(...)` (Write), nicht select/eq (Read/Filter),
// nicht `.insert(...)` (initialer Cursor bei Anlage ist legitim). Der Payload wird in drei
// Formen erkannt: inline-Objekt, `.update(IDENT)` mit `const IDENT = { operative_status: ... }`,
// und `IDENT.operative_status = ...` (Engine-Muster). Lieber ein False-Negative (Payload aus
// Funktions-Rueckgabe) als ein False-Positive — sonst wird der Ratchet disabled.

function stripComments(src) {
  // Kommentar-Zeichen durch Spaces gleicher Laenge ersetzen (Newlines bleiben) — Offsets stabil.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

function lineAt(src, index) {
  let line = 1
  const n = Math.min(index, src.length)
  for (let i = 0; i < n; i++) if (src.charCodeAt(i) === 10) line++
  return line
}

// Ab dem '{' bei openIndex den passenden schliessenden '}' finden (Nesting-aware).
function matchBraces(code, openIndex) {
  let depth = 0
  for (let i = openIndex; i < code.length; i++) {
    const ch = code.charCodeAt(i)
    if (ch === 123) depth++ // {
    else if (ch === 125) { depth--; if (depth === 0) return i + 1 } // }
  }
  return code.length
}

const OP_KEY = /(?<![\w.])operative_status\s*:/

/**
 * @param {string} src TS/TSX-Inhalt
 * @returns {Array<{line:number, form:'inline'|'traced-object'|'traced-assign'}>}
 */
export function scanContent(src) {
  const code = stripComments(src)
  const out = []

  // `.from('claims')` gefolgt (in der Kette) von `.update(` — nur Writes.
  const re = /\.from\(\s*['"]claims['"]\s*\)\s*\.update\(\s*/g
  let m
  while ((m = re.exec(code)) !== null) {
    const argStart = re.lastIndex
    if (code[argStart] === '{') {
      // (1) inline-Objektliteral
      const objEnd = matchBraces(code, argStart)
      const obj = code.slice(argStart, objEnd)
      const km = OP_KEY.exec(obj)
      if (km) out.push({ line: lineAt(src, argStart + km.index), form: 'inline' })
      continue
    }
    // (2)/(3) Identifier-Argument -> Definition bzw. Property-Assign tracen
    const idm = /^([A-Za-z_$][\w$]*)/.exec(code.slice(argStart))
    if (!idm) continue
    const ident = idm[1]

    // (2) const/let/var IDENT ... = { ... operative_status: ... }
    const defRe = new RegExp(`(?:const|let|var)\\s+${ident}\\b[^=\\n]*=\\s*\\{`)
    const dm = defRe.exec(code)
    if (dm) {
      const braceStart = code.indexOf('{', dm.index)
      const defObj = code.slice(braceStart, matchBraces(code, braceStart))
      if (OP_KEY.test(defObj)) {
        out.push({ line: lineAt(src, m.index), form: 'traced-object' })
        continue
      }
    }
    // (3) IDENT.operative_status = ...  (Engine-Muster: claimsUpdate.operative_status = ...)
    //     C1a: auch die CAST-Form `(IDENT as <T>).operative_status = ...` fangen — der Type-Cast
    //     steht zwischen Ident und Property, die fruehere Regex `${ident}\.operative_status` matchte
    //     ihn NICHT (A2-#6: sv-zuweisung war so unsichtbar). Die optionale `\s+as\s+<T>)`-Gruppe
    //     deckt `(claimsUpd as Record<string, unknown>).operative_status = ...` ab; die Plain-Form
    //     bleibt (optionale Gruppe matcht leer).
    const assignRe = new RegExp(`(?<![\\w.])${ident}\\b(?:\\s+as\\s+[^)]+\\))?\\.operative_status\\s*=(?!=)`)
    if (assignRe.test(code)) {
      out.push({ line: lineAt(src, m.index), form: 'traced-assign' })
    }
  }
  return out
}

export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((x) => !base.has(x)).sort(),
    removed: baselineFiles.filter((x) => !cur.has(x)).sort(),
  }
}
