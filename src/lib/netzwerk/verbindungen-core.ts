// Pure Transition-Validierung (keine DB) — TDD-Kern des Verbindungs-Lebenszyklus.
import type { VerbindungRow } from './types'

/** Nur der Empfaenger einer noch OFFENEN Anfrage darf annehmen/ablehnen. */
export function darfAnnehmenOderAblehnen(row: VerbindungRow, meineProfilId: string): boolean {
  return row.status === 'offen' && row.empfaenger_id === meineProfilId
}

/** Beide Beteiligten duerfen eine bestehende Verbindung entfernen/blockieren. */
export function darfEntfernenOderBlockieren(row: VerbindungRow, meineProfilId: string): boolean {
  return row.anfrager_id === meineProfilId || row.empfaenger_id === meineProfilId
}
