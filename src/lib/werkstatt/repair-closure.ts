// WS6 Slice 1 — reine Guard-Logik fuer den Reparatur-Abschluss (client-safe, keine DB-Imports).
// Ein Reparatur-Claim wird per Werkstatt-Abschluss geschlossen — NICHT ueber die state-machine
// (die 'abgeschlossen' nur aus regulierung/klage/zahlung-eingegangen erlaubt), sondern per
// direktem operative_status-Write (Praezedenz: endzustand-actions.ts). Diese Datei kapselt nur
// die Vorbedingung + die Ziel-Konstanten; der Write lebt in der Server-Action (Task 4).

export type ReparaturTerminLike = { status: string | null }
export type ClaimCloseLike = { operative_status: string | null }

export const REPARATUR_CLOSE_STATUS = 'abgeschlossen' as const
export const REPARATUR_CLOSE_GRUND = 'reparatur_erledigt' as const

// Terminal-Zustaende, aus denen NICHT mehr geschlossen wird (idempotent + kein Reopen).
const CLAIM_TERMINAL = new Set(['abgeschlossen', 'storniert', 'abgelehnt', 'verjaehrt'])

/**
 * Darf die Werkstatt diese Reparatur jetzt abschließen? Nur wenn der Termin bestätigt ist
 * (die Reparatur läuft) und der Claim noch nicht terminal ist. `erledigt` ist bereits gesetzt
 * (idempotenter Zweitklick) → false.
 */
export function istReparaturClaimAbschliessbar(claim: ClaimCloseLike, termin: ReparaturTerminLike): boolean {
  if (CLAIM_TERMINAL.has(claim.operative_status ?? '')) return false
  return (termin.status ?? '') === 'bestaetigt'
}
