// AAR-838: Shared Status-Badge für claim_mietwagen.status

import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

const STATUS_MAP: Record<string, { label: string; tone: StatusBadgeTone }> = {
  beantragt: { label: 'Beantragt', tone: 'warning' },
  genehmigt: { label: 'Genehmigt', tone: 'info'    },
  aktiv:     { label: 'Aktiv',     tone: 'brand'   },
  beendet:   { label: 'Beendet',   tone: 'success' },
  abgelehnt: { label: 'Abgelehnt', tone: 'danger'  },
  storniert: { label: 'Storniert', tone: 'neutral' },
}

type Props = { status: string; size?: 'xs' | 'sm' }

export function ClaimMietwagenStatusBadge({ status, size = 'xs' }: Props) {
  const config = STATUS_MAP[status] ?? { label: status, tone: 'neutral' as StatusBadgeTone }
  return <StatusBadge tone={config.tone} size={size}>{config.label}</StatusBadge>
}
