// Claim-Hauptphasen-Badge (main_phase aus v_claim_phase, 4 Phasen). Soft-Slot-Pille,
// Label + Farbe aus der zentralen @/lib/status-Registry (claim-main-phase Domain).
// Analog FallPhaseBadge (Sub-Phase) — loest die inline PHASE_PILL_COLOR ab. Reiner
// <span> (Server- UND Client-safe -> in beiden Komponenten-Arten nutzbar).

import { resolveStatus, statusSlotClass } from '@/lib/status'
import { toClaimMainPhase } from '@/lib/claims/lifecycle'

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'text-[9px] px-1.5 py-0.5',
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export interface ClaimMainPhaseBadgeProps {
  mainPhase: string | null | undefined
  size?: Size
  className?: string
}

export default function ClaimMainPhaseBadge({ mainPhase, size = 'sm', className = '' }: ClaimMainPhaseBadgeProps) {
  const def = resolveStatus('claim-main-phase', toClaimMainPhase(mainPhase))
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]} ${statusSlotClass(def.slot)} ${className}`}
    >
      {def.label}
    </span>
  )
}
