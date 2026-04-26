// AAR-837: Shared Status-Badge für vs_korrespondenz.status

import { StatusBadge } from '@/components/shared/StatusBadge'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

const STATUS_MAP: Record<string, { label: string; tone: StatusBadgeTone }> = {
  gesendet:                  { label: 'Gesendet',              tone: 'info'    },
  wartet_auf_antwort:        { label: 'Wartet auf Antwort',    tone: 'warning' },
  ohne_antwort_abgelaufen:   { label: 'Frist abgelaufen',      tone: 'danger'  },
  beantwortet:               { label: 'Beantwortet',           tone: 'success' },
  archiviert:                { label: 'Archiviert',            tone: 'neutral' },
}

type Props = { status: string; size?: 'xs' | 'sm' }

export function VsKorrespondenzStatusBadge({ status, size = 'xs' }: Props) {
  const config = STATUS_MAP[status] ?? { label: status, tone: 'neutral' as StatusBadgeTone }
  return <StatusBadge tone={config.tone} size={size}>{config.label}</StatusBadge>
}
