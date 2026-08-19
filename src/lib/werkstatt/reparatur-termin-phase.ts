export type ReparaturTerminStatus =
  | 'angefragt' | 'werkstatt_vorschlag' | 'bestaetigt' | 'anruf_erbeten' | 'abgelehnt' | 'erledigt' | 'storniert'

export interface ReparaturTerminPhase {
  key: ReparaturTerminStatus | 'kein_termin'
  label: string
  ton: 'neutral' | 'info' | 'success' | 'warning'
}

const MAP: Record<ReparaturTerminStatus, ReparaturTerminPhase> = {
  angefragt:         { key: 'angefragt',         label: 'Wunschtermin angefragt',          ton: 'info' },
  werkstatt_vorschlag: { key: 'werkstatt_vorschlag', label: 'Werkstatt schlägt Termin vor', ton: 'info' },
  anruf_erbeten:     { key: 'anruf_erbeten',     label: 'Werkstatt meldet sich',           ton: 'info' },
  bestaetigt:    { key: 'bestaetigt',    label: 'Termin bestätigt',          ton: 'success' },
  erledigt:      { key: 'erledigt',      label: 'Reparatur abgeschlossen',   ton: 'success' },
  abgelehnt:     { key: 'abgelehnt',     label: 'Termin abgelehnt',          ton: 'warning' },
  storniert:     { key: 'storniert',     label: 'Termin storniert',          ton: 'neutral' },
}

/**
 * Leitet die Anzeige-Phase aus dem Reparaturtermin-Status ab. null = noch kein Termin.
 *
 * Ops-Test C2-Rest (19.08.): `angefragt` hiess pauschal „Wunschtermin angefragt" — auch
 * dann, wenn gar keine Wunschzeit genannt wurde. Auf prod trifft das ALLE sieben offenen
 * Anfragen (`wunschtermin IS NULL`, u.a. die vier bekannten Haenger CLM-2026-00932/-00939/
 * -00977/-00991). Der Kunde las dort von einem Wunschtermin, den er nie angegeben hat.
 *
 * `hatWunschtermin: false` schaltet auf den neutralen Text. Ohne die Option bleibt das
 * bisherige Label — die Funktion ist damit rueckwaertskompatibel, und Aufrufer ohne
 * Kenntnis des Wunschtermins behaupten nichts Falsches in die andere Richtung.
 */
export function reparaturTerminPhase(
  status: ReparaturTerminStatus | null,
  opts?: { hatWunschtermin?: boolean },
): ReparaturTerminPhase {
  if (status === null) return { key: 'kein_termin', label: 'Kein Reparaturtermin', ton: 'neutral' }
  if (status === 'angefragt' && opts?.hatWunschtermin === false) {
    return { key: 'angefragt', label: 'Terminanfrage läuft', ton: 'info' }
  }
  return MAP[status]
}
