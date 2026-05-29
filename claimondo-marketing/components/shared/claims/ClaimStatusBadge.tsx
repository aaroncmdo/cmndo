// AAR-840: Shared Status-Badge für claims.status
//
// Wrapper über StatusBadge-Primitive, nutzt status-mappings.ts als Single
// Source. viewerRole bestimmt ob Admin- oder Kunde-Label gerendert wird.

import { StatusBadge } from '@/components/shared/StatusBadge'
import { getStatusMapping } from './status-mappings'

type Props = {
  status: string
  /** Kunde-freundliches Label vs. fachliches. Default: 'admin' */
  viewerRole?: 'admin' | 'kb' | 'sv' | 'kunde'
  size?: 'xs' | 'sm'
  /** Icon links neben Label rendern */
  withIcon?: boolean
}

export function ClaimStatusBadge({
  status,
  viewerRole = 'admin',
  size = 'xs',
  withIcon = false,
}: Props) {
  const m = getStatusMapping(status)
  const label = viewerRole === 'kunde' ? m.labelKunde : m.label
  const Icon = m.icon

  return (
    <StatusBadge tone={m.tone} size={size}>
      {withIcon && <Icon className="w-3 h-3" />}
      {label}
    </StatusBadge>
  )
}
