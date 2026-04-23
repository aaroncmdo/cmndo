// AAR-410: Zentrale Schadens-Ursache-Badge-Primitive.
// Zieht Label + Farben aus SCHADENS_URSACHE_LABELS/SCHADENS_URSACHE_COLORS
// in src/lib/statusLabels.ts. Nutzt alle Stellen die bisher eigene
// URSACHE_LABEL/URSACHE_COLOR-Maps hatten.

import { SCHADENS_URSACHE_LABELS, SCHADENS_URSACHE_COLORS } from '@/lib/statusLabels'

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'text-[9px] px-1.5 py-0.5',
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export interface SchadensUrsacheBadgeProps {
  ursache: string | null | undefined
  size?: Size
  plain?: boolean // ohne Farb-Chip, nur das Label als Text
  className?: string
}

export default function SchadensUrsacheBadge({
  ursache,
  size = 'sm',
  plain = false,
  className = '',
}: SchadensUrsacheBadgeProps) {
  const code = ursache ?? ''
  const label = SCHADENS_URSACHE_LABELS[code] ?? code ?? '—'
  if (plain) {
    return <span className={className}>{label || '—'}</span>
  }
  const color = SCHADENS_URSACHE_COLORS[code] ?? 'bg-[#f8f9fb] text-claimondo-navy'
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${SIZE_CLASSES[size]} ${color} ${className}`}
    >
      {label || '—'}
    </span>
  )
}
