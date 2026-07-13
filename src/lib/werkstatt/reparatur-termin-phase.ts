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

/** Leitet die Anzeige-Phase aus dem Reparaturtermin-Status ab. null = noch kein Termin. */
export function reparaturTerminPhase(status: ReparaturTerminStatus | null): ReparaturTerminPhase {
  if (status === null) return { key: 'kein_termin', label: 'Kein Reparaturtermin', ton: 'neutral' }
  return MAP[status]
}
