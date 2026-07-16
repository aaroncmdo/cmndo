// Pure Logik fuer den Reachability-Ratchet: erkennt anon-SELECT-Policies mit einem
// Zweig, der OHNE eingeloggten User (auth.uid() IS NULL = true-anon) Zeilen durchlaesst.
// Keine I/O, kein DB -> unit-testbar. Backing-RPC audit_anon_reachable_pii() liefert
// (table_name, policy_name, qual, pii_columns). CLI-Wrapper: ../check-anon-reachability.mjs
//
// Hintergrund: RLS schuetzt ZEILEN ueber die Policy-qual. Ein qual-OR-Zweig, der auth.uid()
// nicht braucht (z.B. `(source IS NULL) AND (erstellt_am > now()-5min)`), gibt true-anon
// echte Zeilen -> auf einer PII-Tabelle ein aktives Leck. Der Spalten-Namen-Ratchet
// (audit_anon_sensitive_grants) faengt das NICHT (er prueft Grants auf Spalten-NAMEN, nicht
// Policy-Reachability). Fund 16.07.: gutachter_finder_anfragen (PII 5-Min-Fenster, Mig
// 20260716200848). Diese Ratchet-Achse haelt die Klasse dauerhaft zu.

// Tokens, die einen qual-Zweig an einen eingeloggten User binden (auth.uid() direkt ODER
// SECURITY-DEFINER-Helper, die intern auth.uid() nutzen). Ein Zweig mit einem dieser Tokens
// ist fuer true-anon (uid NULL) nicht erfuellbar. auth.role() = 'authenticated'/'service_role'
// zaehlt ebenfalls (anon hat role='anon'). Neue Helper hier ergaenzen.
export const UID_GATE_TOKENS = [
  'auth.uid',
  'auth.role',
  'is_staff',
  'is_admin',
  'is_kanzlei',
  'is_sv_for_claim',
  'can_access_claim',
  'is_claim_user_party',
  'get_sv_id',
  'is_buero_admin',
  'is_kunde',
  'is_gutachter',
  'is_dispatch',
  'is_leadbearbeiter',
  'claim_sichtbar_fuer_aktuellen_user',
]

/**
 * Entfernt EIN umschliessendes Klammernpaar, wenn die erste `(` zur letzten `)` matcht
 * (Tiefe faellt dazwischen nie auf 0). Wiederholt, bis kein umschliessendes Paar mehr da ist.
 * pg_get_expr wickelt zusammengesetzte quals in `(... OR ...)` -> ohne Strip laege das
 * top-level OR bei Tiefe 1 und der Split saehe faelschlich nur EINEN Zweig (Leck-Miss).
 * @param {string} s
 * @returns {string}
 */
export function stripOuterParens(s) {
  let str = s.trim()
  while (str.startsWith('(') && str.endsWith(')')) {
    let depth = 0
    let umschlossen = true
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '(') depth++
      else if (str[i] === ')') depth--
      if (depth === 0 && i < str.length - 1) {
        umschlossen = false
        break
      }
    }
    if (!umschlossen) break
    str = str.slice(1, -1).trim()
  }
  return str
}

/**
 * Splittet einen SQL-Boolean-Ausdruck an TOP-LEVEL ` OR ` (Klammer-Tiefe 0), nach dem
 * Entfernen umschliessender Klammern. Newlines werden zu Space normalisiert.
 * @param {string} qual
 * @returns {string[]}
 */
export function topLevelOrBranches(qual) {
  const s = stripOuterParens(String(qual).replace(/\s+/g, ' ').trim())
  const branches = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && s.slice(i, i + 4).toUpperCase() === ' OR ') {
      branches.push(s.slice(start, i))
      i += 3
      start = i + 1
    }
  }
  branches.push(s.slice(start))
  return branches.map((b) => b.trim()).filter(Boolean)
}

/**
 * true, wenn der Zweig ein UID-Gate-Token enthaelt UND NICHT explizit auf `auth.uid() IS NULL`
 * (= absichtlich anon-oeffnend) testet.
 * @param {string} branch
 */
function branchIstUidGated(branch) {
  const lower = branch.toLowerCase()
  // Anti-Pattern: `auth.uid() IS NULL` oeffnet den Zweig fuer anon -> NICHT gated. Supabase
  // rendert das als `( select auth.uid() as uid) is null` (InitPlan-Wrapper), also `is null`
  // nicht direkt nach `auth.uid()` — grober Match (auth.uid … is null) ist konservativ:
  // im Zweifel over-flagging (reachable), die sichere Richtung.
  if (/auth\.uid\b[\s\S]*?\bis\s+null/.test(lower)) return false
  return UID_GATE_TOKENS.some((t) => lower.includes(t.toLowerCase()))
}

/**
 * Kern-Heuristik: ist die Policy fuer true-anon (uid NULL) reachable?
 * true, wenn qual = 'true' ODER mindestens EIN top-level-OR-Zweig KEIN UID-Gate hat.
 * Bewusst konservativ (over-flagging): eine neue, unbekannte Helper-Funktion -> geflaggt, bis
 * sie in UID_GATE_TOKENS steht oder in der Baseline. Lieber ein FP als ein verpasstes Leck.
 * @param {string} qual
 * @returns {boolean}
 */
export function qualReachableOhneUid(qual) {
  const norm = String(qual).replace(/\s+/g, ' ').trim().toLowerCase()
  if (norm === 'true') return true
  if (norm === 'false' || norm === '') return false
  return topLevelOrBranches(qual).some((b) => !branchIstUidGated(b))
}

/**
 * RPC-Zeilen -> Verletzer-Keys "table.policy". Eine Zeile ist Verletzer, wenn ihre Tabelle
 * >=1 Kontakt-PII-Spalte hat (RPC-seitig gefiltert -> pii_columns nicht leer) UND die qual
 * fuer true-anon reachable ist.
 * @param {Array<{table_name:string, policy_name:string, qual:string, pii_columns:string[]}>} rows
 * @returns {string[]}
 */
export function rowsToViolations(rows) {
  return rows
    .filter((r) => Array.isArray(r.pii_columns) && r.pii_columns.length > 0)
    .filter((r) => qualReachableOhneUid(r.qual))
    .map((r) => `${r.table_name}.${r.policy_name}`)
    .sort()
}

/**
 * @param {string[]} currentKeys aktueller Verletzer-Satz
 * @param {string[]} baselineKeys grandfatherte Verletzer
 * @returns {{added:string[], removed:string[]}}
 */
export function diffBaseline(currentKeys, baselineKeys) {
  const base = new Set(baselineKeys)
  const cur = new Set(currentKeys)
  return {
    added: currentKeys.filter((k) => !base.has(k)).sort(),
    removed: baselineKeys.filter((k) => !cur.has(k)).sort(),
  }
}
