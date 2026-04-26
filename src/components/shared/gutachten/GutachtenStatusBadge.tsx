// AAR-834: Shared Status-Badge für gutachten.status (5 Werte)

import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

const STATUS_MAP: Record<string, { label: string; tone: StatusBadgeTone }> = {
  beauftragt:    { label: 'Beauftragt',    tone: 'info'    },
  besichtigt:    { label: 'Besichtigt',    tone: 'warning' },
  in_erstellung: { label: 'In Erstellung', tone: 'brand'   },
  final:         { label: 'Final',         tone: 'success' },
  storniert:     { label: 'Storniert',     tone: 'danger'  },
}

type Props = {
  status: string
  size?: 'xs' | 'sm'
}

export function GutachtenStatusBadge({ status, size = 'xs' }: Props) {
  const config = STATUS_MAP[status] ?? { label: status, tone: 'neutral' as StatusBadgeTone }
  return (
    <StatusBadge tone={config.tone} size={size}>
      {config.label}
    </StatusBadge>
  )
}
