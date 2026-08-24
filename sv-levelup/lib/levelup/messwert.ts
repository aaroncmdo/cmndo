/**
 * Diskriminierte Union fuer jeden gemessenen Wert.
 *
 * Sie deckt zwei der eisernen Regeln auf Typebene ab:
 *   R-A — jede Zahl traegt Quelle und Erhebungsdatum
 *   R-B — fehlt ist NICHT null: der Zustand 'nicht_erhebbar' erzwingt
 *         wert: null UND einen Grund. Eine 0 als Platzhalter ist damit
 *         typseitig unmoeglich.
 *
 * Der Validator darunter faengt zur Laufzeit ab, was aus jsonb kommt und
 * deshalb ungetypt ist (levelup_checks.befunde).
 */
export type Messwert<T> = {
  quelle: string
  erhoben: string | null
} & (
  | { status: 'ok'; wert: T }
  | { status: 'nicht_erhebbar'; wert: null; grund: string }
)

/**
 * Prueft einen Befund aus jsonb. Ein ungueltiger Befund wird verworfen und
 * als Fehlstelle ausgegeben — nie stillschweigend uebernommen (T-08, T-09).
 */
export function istGueltig(m: unknown): boolean {
  if (typeof m !== 'object' || m === null) return false
  const o = m as Record<string, unknown>

  // R-A: ohne Quelle kein Befund.
  if (typeof o.quelle !== 'string' || o.quelle.length === 0) return false

  if (o.status === 'ok') {
    // R-A: ein erhobener Wert traegt immer sein Datum.
    if (typeof o.erhoben !== 'string' || o.erhoben.length === 0) return false
    return o.wert !== null && o.wert !== undefined
  }

  if (o.status === 'nicht_erhebbar') {
    // R-B: "nicht erhoben" braucht einen Grund und ist NIE 0.
    if (typeof o.grund !== 'string' || o.grund.length === 0) return false
    return o.wert === null
  }

  return false
}
