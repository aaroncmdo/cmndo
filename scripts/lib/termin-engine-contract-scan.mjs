// Pure Scan-Logik der Termin-Engine-Contract-Drift-Bremse.
// Findet CONTRACT-Anti-Patterns (direkte Legacy-Filter auf `gutachter_termine`)
// AUSSERHALB der Engine. Block-aware: ein `.eq('lead_id'|'sv_id')` zählt nur,
// wenn es im selben Query-Segment wie ein `.from('gutachter_termine')` steht
// (Segment = bis zum nächsten `.from(`), damit Filter auf anderen Tabellen
// (leads.lead_id, claims.sv_id, …) keine False-Positives erzeugen.
//
// Regeln + Begründung: src/lib/termine/engine/CONTRACT.md §Anti-Patterns.

const GT_FROM = /\.from\(\s*['"]gutachter_termine['"]\s*\)/g

const RULES = [
  {
    rule: 'lead_id-direct',
    re: /\.eq\(\s*['"]lead_id['"]/,
    hint: "findeTerminFuerLead(db, leadId) statt .eq('lead_id') — verfehlt sonst bezug-native Termine (#2580)",
  },
  {
    rule: 'sv_id-direct',
    re: /\.eq\(\s*['"]sv_id['"]/,
    hint: ".eq('assignee_id', x).eq('assignee_typ','sachverstaendiger') statt .eq('sv_id') (gedroppt, CMM-49)",
  },
]

// Begrenzt, wie weit ein Query-Segment reicht, falls kein nächstes `.from(` folgt —
// verhindert, dass ein weit entferntes, unverbundenes `.eq` fälschlich zugeordnet wird.
const MAX_SEGMENT_CHARS = 800

// Entfernt Kommentare, BEHÄLT aber Zeilenumbrüche (Zeilennummern bleiben stabil),
// damit `.eq('lead_id')` in einem Doc-Kommentar nicht als Verletzer zählt.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * @param {string} content Datei-Inhalt (.ts/.tsx)
 * @returns {{rule:string,line:number,hint:string}[]} Verletzungen (leer = sauber)
 */
export function scanContent(content) {
  const src = stripComments(content)
  const hits = []
  let m
  GT_FROM.lastIndex = 0
  while ((m = GT_FROM.exec(src)) !== null) {
    const start = m.index + m[0].length
    const nextFrom = src.indexOf('.from(', start)
    const end = Math.min(
      nextFrom === -1 ? src.length : nextFrom,
      start + MAX_SEGMENT_CHARS,
    )
    const segment = src.slice(start, end)
    for (const { rule, re, hint } of RULES) {
      if (re.test(segment)) {
        const line = src.slice(0, m.index).split('\n').length
        hits.push({ rule, line, hint })
      }
    }
  }
  return hits
}

/**
 * Mengen-Diff für den Ratchet.
 * @param {string[]} current Aktuelle Verletzer-Files
 * @param {string[]} baseline Bekannte Verletzer-Files
 */
export function diffBaseline(current, baseline) {
  const base = new Set(baseline)
  const cur = new Set(current)
  return {
    added: current.filter((x) => !base.has(x)),
    removed: baseline.filter((x) => !cur.has(x)),
  }
}
