// AAR-410 / AAR-769 Phase 3 / AAR-782: Zentrale Fall-Status-Badge-Primitive.
// W1: Label + Slot-Farbe kommen jetzt aus der zentralen @/lib/status-Registry
// (fall-status Domain). Verhalten byte-identisch zur Legacy-Ableitung aus
// FALL_STATUS_LABELS/FALL_STATUS_COLORS — bewiesen in fall-status.parity.test.ts.

import { statusLabel, statusSlotClass, resolveStatus, isKnownStatus } from '@/lib/status'

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'text-[9px] px-1.5 py-0.5',
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export interface FallStatusBadgeProps {
  status: string | null | undefined
  size?: Size
  className?: string
}

/** Reine Label+Farb-Ableitung (Pure-Seam für den Parity-Test). */
export function fallStatusBadgeParts(status: string | null | undefined): { label: string; color: string } {
  const code = status ?? ''
  const known = isKnownStatus('fall-status', code)
  return {
    label: known ? statusLabel('fall-status', code) : code,
    color: known
      ? statusSlotClass(resolveStatus('fall-status', code).slot)
      : 'bg-claimondo-bg text-claimondo-navy border-claimondo-border',
  }
}

export default function FallStatusBadge({ status, size = 'sm', className = '' }: FallStatusBadgeProps) {
  const { label, color } = fallStatusBadgeParts(status)
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]} ${color} ${className}`}
    >
      {label}
    </span>
  )
}
