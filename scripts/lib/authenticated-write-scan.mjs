// Pure Logik fuer den Authenticated-Write-Reachability-Ratchet: erkennt PERMISSIVE
// authenticated-WRITE-Policies (INSERT/UPDATE/DELETE), deren reachability-relevanter
// Ausdruck einen top-level-OR-Zweig OHNE auth.uid()/Scoping-Helper hat = JEDER eingeloggte
// User kann fremde/beliebige Zeilen schreiben (cross-user/cross-tenant Write). Keine I/O,
// unit-testbar. Backing-RPC audit_authenticated_write_reachable() liefert
// (table_name, policy_name, cmd, check_expr). CLI-Wrapper: ../check-authenticated-write-reachability.mjs
//
// Wiederverwendet die generische Zweig-Zerlegung des anon-reachability-Scanners
// (topLevelOrBranches/stripOuterParens) + dessen UID_GATE_TOKENS als Basis. ABER eigene
// Gate-Pruefung OHNE das anon-Anti-Pattern `auth.uid() IS NULL`: das ist ein ANON-Konzept
// (Zweig oeffnet fuer true-anon) und wuerde hier greedy fehlmatchen, sobald ein Zweig
// `auth.uid()` … `<spalte> IS NULL` enthaelt (z.B. `kundenbetreuer_id IS NULL`, `fall_id IS NULL`)
// -> massenhaft FP auf real gescopten claims/tasks-Policies. Fuer den authenticated-Fall zaehlt
// nur: enthaelt der Zweig einen UID-/Scoping-/Operator-Gate-Token? Wenn nein -> jeder eingeloggte
// User erfuellt den Zweig -> reachable.
//
// Hintergrund: WURZEL (#4555) macht authenticated-Write per Default-Privileg default-closed
// (GRANT-Achse). Diese Achse ist orthogonal: eine EXPLIZIT gegrantete Tabelle mit einer
// ungescopten Write-POLICY. Read-seitig ist die Fund-Klasse durch kanzlei_faelle belegt
// (AUDIT-kanzlei-cross-tenant-scoping-2026-07-19); write-seitig aktuell 0 echte Lecks (alle
// gescopt oder bewusst broad) — dieser Ratchet haelt die Klasse dauerhaft zu.

import { UID_GATE_TOKENS, topLevelOrBranches, diffBaseline } from './anon-reachability-scan.mjs'

// Basis = anon UID-Gates + write-spezifische Operator-/Scoping-Helper, die einen Zweig an den
// eingeloggten User binden (Rolle-Gate ODER Firma/Owner-Scoping). Neue Helper hier ergaenzen.
export const WRITE_GATE_TOKENS = [
  ...UID_GATE_TOKENS,
  'is_kundenbetreuer',            // Operator-Rolle (broad-write erlaubt)
  'is_sv',                        // SV-Rolle (is_sv() in tasks-INSERT)
  'auth_flottenmanager_firma_id', // Firma-Scoping: firma_id = auth_flottenmanager_firma_id()
  'auth_user_firma_id',           // Firma-Scoping: firma_id = auth_user_firma_id()
]

/**
 * true, wenn der Zweig einen Gate-Token enthaelt (auth.uid() direkt, ein SECURITY-DEFINER-
 * Scoping-Helper, oder einen Operator-Rollen-Check). KEIN anon-Anti-Pattern.
 * @param {string} branch
 */
export function branchIsWriteGated(branch) {
  const lower = branch.toLowerCase()
  return WRITE_GATE_TOKENS.some((t) => lower.includes(t.toLowerCase()))
}

/**
 * Kern-Heuristik: ist die Write-Policy fuer einen beliebigen eingeloggten User reachable?
 * true, wenn expr = 'true' ODER mindestens EIN top-level-OR-Zweig KEIN Gate hat. null/'' /'false'
 * -> je nach Caller (null wird im Caller als reachable gewertet). Bewusst konservativ
 * (over-flagging): ein neuer, unbekannter Scoping-Helper -> geflaggt, bis er in WRITE_GATE_TOKENS
 * oder der Baseline steht. Lieber ein FP als ein verpasstes Write-Leck.
 * @param {string} expr
 * @returns {boolean}
 */
export function writeExprReachable(expr) {
  const norm = String(expr).replace(/\s+/g, ' ').trim().toLowerCase()
  if (norm === 'true') return true
  if (norm === 'false' || norm === '') return false
  return topLevelOrBranches(expr).some((b) => !branchIsWriteGated(b))
}

/**
 * RPC-Zeilen -> Verletzer-Keys "table.policy". Eine Zeile ist Verletzer, wenn ihr
 * reachability-relevanter Ausdruck (check_expr) reachable ist ODER null (kein Check-Ausdruck
 * = ungated, konservativ als Verletzer gewertet).
 * @param {Array<{table_name:string, policy_name:string, cmd:string, check_expr:string|null}>} rows
 * @returns {string[]}
 */
export function rowsToWriteViolations(rows) {
  return rows
    .filter((r) => r.check_expr == null || writeExprReachable(r.check_expr))
    .map((r) => `${r.table_name}.${r.policy_name}`)
    .sort()
}

export { diffBaseline }
