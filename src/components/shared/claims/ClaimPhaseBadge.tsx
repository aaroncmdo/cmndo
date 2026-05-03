// AAR-840: Shared Phase-Badge für claims.phase

import { StatusBadge } from '@/components/shared/StatusBadge'
import { getPhaseMapping } from './phase-mappings'

type Props = {
  phase: string
  viewerRole?: 'admin' | 'kb' | 'sv' | 'kunde'
  size?: 'xs' | 'sm'
  withIcon?: boolean
}

export function ClaimPhaseBadge({
  phase,
  viewerRole = 'admin',
  size = 'xs',
  withIcon = false,
}: Props) {
  const m = getPhaseMapping(phase)
  const label = viewerRole === 'kunde' ? m.labelKunde : m.label
  const Icon = m.icon

  return (
    <StatusBadge tone={m.tone} size={size}>
      {withIcon && <Icon className="w-3 h-3" />}
      {label}
    </StatusBadge>
  )
}
