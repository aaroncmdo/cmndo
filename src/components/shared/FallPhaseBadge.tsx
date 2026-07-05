// W1: Fall-Phasen-Badge (claim sub_phase aus v_claim_phase). Soft-Slot-Pille,
// Label+Farbe aus der zentralen @/lib/status-Registry (fall-phase Domain).
// Analog FallStatusBadge, aber fuer die Subphase — gibt der Phase die Farbe,
// die lifecycle.ts SUBPHASE_LABEL nie hatte. Reiner <span> (Server-safe, kein
// Client-Component-Import) -> in Server- UND Client-Komponenten nutzbar.

import { resolveStatus, statusSlotClass } from '@/lib/status'
import { toClaimSubPhase } from '@/lib/claims/lifecycle'

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'text-[9px] px-1.5 py-0.5',
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export interface FallPhaseBadgeProps {
  subPhase: string | null | undefined
  size?: Size
  className?: string
}

export default function FallPhaseBadge({ subPhase, size = 'sm', className = '' }: FallPhaseBadgeProps) {
  const def = resolveStatus('fall-phase', toClaimSubPhase(subPhase))
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]} ${statusSlotClass(def.slot)} ${className}`}
    >
      {def.label}
    </span>
  )
}
