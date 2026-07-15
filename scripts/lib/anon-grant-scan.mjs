// Pure Diff-/Allowlist-Logik fuer die anon-Grant-Drift-Bremse (Grant-Audit-Ratchet).
// Keine I/O, kein DB -> unit-testbar. CLI-Wrapper + RPC-Call: ../check-anon-sensitive-grants.mjs
//
// Hintergrund: RLS gewaehrt ZEILEN, aber `anon` hatte auf vielen Tabellen einen table-weiten
// SELECT-Grant. Ein spaeterer anon-Policy-Zweig (oder RLS-Off) legt damit sensible Spalten offen
// (Bank/Steuer/OAuth-Token/Secret/Notizen). Die 4 Fixes (claims/auftraege/anon-7/leads) schlossen
// konkrete Lecks; dieser Ratchet blockt NEUE anon-SELECT-Grants auf sensible Spalten-Muster.
// Backing-Scan: RPC audit_anon_sensitive_grants() (pg_catalog + has_column_privilege).
//
// SEMANTIC_ALLOWLIST: Spalten, deren NAME zwar auf das Muster passt, die aber KEIN Geheimnis
// sind (Timestamps/Zaehler). Hier gepflegt (nicht in der RPC), damit FP-Ergaenzungen keine
// Migration brauchen. Jeder Eintrag mit Begruendung.

export const SEMANTIC_ALLOWLIST = [
  // Timestamp der Twilio-Nummer-Provisionierung, kein Geheimnis — matcht `provision` in "provisioned".
  'profiles.twilio_nummer_provisioned_am',
]

/**
 * RPC-Zeilen [{table_name, column_name}] -> sortierte "table.column"-Keys, ohne Allowlist-FPs.
 * @param {Array<{table_name:string, column_name:string}>} rows
 * @param {string[]} [allowlist]
 * @returns {string[]}
 */
export function rowsToKeys(rows, allowlist = SEMANTIC_ALLOWLIST) {
  const allow = new Set(allowlist)
  return rows
    .map((r) => `${r.table_name}.${r.column_name}`)
    .filter((k) => !allow.has(k))
    .sort()
}

/**
 * @param {string[]} currentKeys aktueller Verletzer-Satz (Allowlist bereits raus)
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
