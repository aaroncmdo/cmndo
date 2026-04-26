// AAR-837: Shared Status-Badge für claim_payments.status

import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

const STATUS_MAP: Record<string, { label: string; tone: StatusBadgeTone }> = {
  ausstehend: { label: 'Ausstehend', tone: 'warning' },
  teilweise:  { label: 'Teilweise',  tone: 'info'    },
  erhalten:   { label: 'Erhalten',   tone: 'success' },
  final:      { label: 'Final',      tone: 'brand'   },
  abgelehnt:  { label: 'Abgelehnt',  tone: 'danger'  },
}

type Props = { status: string; size?: 'xs' | 'sm' }

export function ClaimPaymentStatusBadge({ status, size = 'xs' }: Props) {
  const config = STATUS_MAP[status] ?? { label: status, tone: 'neutral' as StatusBadgeTone }
  return <StatusBadge tone={config.tone} size={size}>{config.label}</StatusBadge>
}
