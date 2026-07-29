// Effektiver Anzeige-Status eines FlowLinks fuer das Dispatch-Panel.
// Pure + testbar. Hintergrund (FlowLink-Audit 27.07. + Bug2): der DB-Status
// 'abgelaufen' wird von keinem Writer gesetzt — Ablauf ist eine ZEIT-Eigenschaft
// (expires_at), kein persistierter Zustand. Ohne Ableitung zeigte das Panel fuer
// abgelaufene Links roh "erstellt".

export type FlowlinkStatusQuelle = {
  status: string
  expires_at: string
  geoeffnet_am: string | null
  abgeschlossen_am: string | null
}

export function effektiverFlowlinkStatus(link: FlowlinkStatusQuelle, now: Date = new Date()): string {
  if (link.abgeschlossen_am) return 'abgeschlossen'
  if (link.geoeffnet_am) return 'geoeffnet'
  // Bewusste Handlung (storniert) schlaegt den blossen Zeitablauf.
  if (link.status === 'storniert') return 'storniert'
  if (new Date(link.expires_at) < now) return 'abgelaufen'
  return link.status
}
