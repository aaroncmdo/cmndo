// AAR-836: Shared Status-Badge für repairs.status (4 Werte)

import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

const STATUS_MAP: Record<string, { label: string; tone: StatusBadgeTone }> = {
  geplant:       { label: 'Geplant',       tone: 'info'    },
  in_arbeit:     { label: 'In Arbeit',     tone: 'warning' },
  abgeschlossen: { label: 'Abgeschlossen', tone: 'success' },
  storniert:     { label: 'Storniert',     tone: 'danger'  },
}

type Props = {
  status: string
  size?: 'xs' | 'sm'
}

export function RepairStatusBadge({ status, size = 'xs' }: Props) {
  const config = STATUS_MAP[status] ?? { label: status, tone: 'neutral' as StatusBadgeTone }
  return (
    <StatusBadge tone={config.tone} size={size}>
      {config.label}
    </StatusBadge>
  )
}
