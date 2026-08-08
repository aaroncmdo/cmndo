// P3.3 (Operativ-Audit 17.07.): Bezug-aware Filter fuer gutachter_termine (Legacy-Retire).
//
// `gutachter_termine` traegt den Termin-Auftrag ("WOFÜR") auf ZWEI Achsen:
//   - Legacy (transitional): fall_id / lead_id / claim_id
//   - Kanonisch: bezug_typ ('fall'|'lead'|'claim') + bezug_id
// Die Termin-Engine schreibt NEUE Termine bezug-nativ (nur bezug_typ+bezug_id, OHNE
// Legacy-Spalte -- siehe effektive-bezug-ids.ts + engine/CONTRACT.md). Ein naiver
// `.eq('fall_id', X)` uebersieht solche bezug-nativen Termine (deren fall_id ist NULL).
//
// Dieser Helper liefert den PostgREST-`or`-Ausdruck, der BEIDE Achsen matcht -- ein
// SUPERSET des naiven Filters (findet nie weniger, und dank bezug_id.eq nie einen
// fremden Termin). Gegenstueck zu `effektiveBezugIds()`, das die Achsen beim READ
// aufloest; dieser hier ist fuer FILTER (WHERE-Klausel):
//
//   // vorher (uebersieht bezug-native Termine):
//   supabase.from('gutachter_termine').select('id').eq('fall_id', fallId)
//   // nachher (bezug-aware):
//   supabase.from('gutachter_termine').select('id').or(bezugOrExpr('fall', fallId))
//
// Weitere top-level-Filter (.eq('status', …)) bleiben daneben stehen und AND-verknuepfen
// mit der or-Gruppe (PostgREST-Semantik), also z.B.
//   .or(bezugOrExpr('fall', X)).eq('status', 'bestaetigt')
//   == (fall_id=X OR (bezug_typ.in.(fall,claim) AND bezug_id=X)) AND status=bestaetigt
//
// WICHTIG: 'fall' und 'claim' bilden eine Aequivalenzklasse (claim-first: fall_id==claims.id,
// dieselbe UUID) — Reader beider Vokabeln treffen die gleiche Zeile. 'lead' bleibt streng.
//
// Teil des Legacy-Retire (44 Consumer-Files, Boy-Scout — Marker audit-operativ-luecken).

export type BezugAchse = 'fall' | 'lead' | 'claim'

/**
 * PostgREST-or-Ausdruck fuer die bezug-aware Filterung von gutachter_termine.
 * @param achse 'fall' | 'lead' | 'claim' — die Legacy-Spalte heisst `${achse}_id`.
 *              'fall' und 'claim' matchen das gleiche bezug_typ-Set (beide → 'fall' oder
 *              'claim' in der DB, claim-first Semantik).
 * @param id    Die Ziel-UUID (fall_id/lead_id/claim_id-PK). MUSS eine UUID sein — die
 *              PKs sind es immer; da der Wert in den or-String interpoliert wird, wuerden
 *              Sonderzeichen (Komma/Klammer) den Filter brechen. Keine freien Strings.
 */
export function bezugOrExpr(achse: BezugAchse, id: string): string {
  const typExpr = achse === 'lead' ? 'bezug_typ.eq.lead' : 'bezug_typ.in.(fall,claim)'
  return `${achse}_id.eq.${id},and(${typExpr},bezug_id.eq.${id})`
}

/**
 * .in-Variante von bezugOrExpr: bezug-aware Filterung von gutachter_termine mit einer ID-LISTE.
 * Ersetzt `.in('${achse}_id', ids)` durch `.or(bezugInExpr(achse, ids))` — matcht die Legacy-Spalte
 * ODER die kanonische bezug-Achse (Superset). PostgREST-`in.(…)`-Syntax INNERHALB `.or()`; die inneren
 * Kommas sind klammer-sicher (PostgREST parst klammer-aware). PROD-VERIFIZIERT 2026-07-17 via echtem
 * supabase-js-Call: Syntax gueltig, Superset findet den bezug-nativen Termin (naive .in=15 → .or=16),
 * leere Liste → `in.()` matcht nichts OHNE Error → KEIN Guard noetig (wie `.in(col, [])`).
 * @param achse 'fall' | 'lead' | 'claim' — die Legacy-Spalte heisst `${achse}_id`.
 *              'fall' und 'claim' matchen das gleiche bezug_typ-Set (beide → 'fall' oder
 *              'claim' in der DB, claim-first Semantik).
 * @param ids   Ziel-UUIDs (fall_id/lead_id/claim_id-PKs). MUESSEN UUIDs sein — der Wert wird in den
 *              or-String interpoliert; Sonderzeichen (Komma/Klammer) wuerden den Filter brechen.
 */
export function bezugInExpr(achse: BezugAchse, ids: string[]): string {
  const list = ids.join(',')
  const typExpr = achse === 'lead' ? 'bezug_typ.eq.lead' : 'bezug_typ.in.(fall,claim)'
  return `${achse}_id.in.(${list}),and(${typExpr},bezug_id.in.(${list}))`
}
