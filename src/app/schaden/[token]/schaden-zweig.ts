// Reine Entscheidungs-Logik fuer die rollen-bewusste /schaden/[token]-Seite.
// (Rolle × firma-Match × Karten-Status) -> welcher Zweig gerendert wird.
// Bewusst pure + ohne DB, damit sie isoliert testbar ist.

export type SchadenZweig = 'bind' | 'manage' | 'gegner'

export function schadenZweig(input: {
  /** Ist der eingeloggte User ein Flottenmanager? */
  istFlottenmanager: boolean
  /** Firma des eingeloggten Flottenmanagers (null wenn keiner). */
  fmFirmaId: string | null
  /** Firma, zu der die Schadenkarte gehoert (null wenn Karte unbekannt). */
  kartenFirmaId: string | null
  /** schadenkarten.status ('gebunden' | 'frei' | 'bestellt' | ...). */
  status: string | null
}): SchadenZweig {
  const eigeneKarte =
    input.istFlottenmanager &&
    !!input.fmFirmaId &&
    input.fmFirmaId === input.kartenFirmaId

  // Fremde / nicht eingeloggte Besucher: immer der bestehende Gegner-Flow.
  if (!eigeneKarte) return 'gegner'

  // Eigene Karte: gebunden -> Verwaltung/Info; sonst -> binden.
  return input.status === 'gebunden' ? 'manage' : 'bind'
}
