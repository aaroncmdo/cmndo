// Pure Helper: Werkstatt-Vermittlungs-Status -> Label + Badge-Klasse (token-konform).

import type { WerkstattVermittlungStatus } from './queries'

const MAP: Record<WerkstattVermittlungStatus, { label: string; className: string }> = {
  eingegangen: {
    label: 'Eingegangen',
    className: 'bg-claimondo-bg text-claimondo-ondo border border-claimondo-border',
  },
  beauftragt: {
    label: 'Beauftragt',
    className: 'bg-info-soft text-info-strong border border-info/20',
  },
  freigabe_ausstehend: {
    label: 'Freigabe ausstehend',
    className: 'bg-warning-soft text-warning-strong border border-warning/20',
  },
  reparatur_freigegeben: {
    label: 'Reparatur freigegeben',
    className: 'bg-success-soft text-success-strong border border-success/20',
  },
  storniert: {
    label: 'Storniert',
    className: 'bg-danger-soft text-danger-strong border border-danger/20',
  },
}

export function vermittlungStatusBadge(
  status: WerkstattVermittlungStatus,
): { label: string; className: string } {
  return MAP[status] ?? MAP.eingegangen
}
