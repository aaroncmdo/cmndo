// AAR-410 / AAR-769 Phase 3: Zentrale Fall-Status-Badge-Primitive.
// Zieht Label + Farben aus FALL_STATUS_LABELS/FALL_STATUS_COLORS in
// src/lib/statusLabels.ts. Die Map liefert pro Status einen Dark-Mode-
// Tailwind-Color-String (bg-blue-950 etc.) — der diskrete <Badge>-Primitive
// kann diese Statusfarben nicht alle abbilden. Render bleibt Span, Token-
// Sweep der Fallback-Farben unten.

import { FALL_STATUS_LABELS, FALL_STATUS_COLORS } from '@/lib/statusLabels'

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

export default function FallStatusBadge({ status, size = 'sm', className = '' }: FallStatusBadgeProps) {
  const code = status ?? ''
  const label = FALL_STATUS_LABELS[code] ?? code ?? '—'
  const color = FALL_STATUS_COLORS[code] ?? 'bg-[#f8f9fb] text-claimondo-navy border-claimondo-border'
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]} ${color} ${className}`}
    >
      {label}
    </span>
  )
}
