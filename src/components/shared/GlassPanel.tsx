// Shared-Panel: glass-light Surface mit claimondo-border + iOS-Radius.
// Ersetzt `bg-white border border-gray-200 rounded-2xl`-Duplikate.

import type { ReactNode, HTMLAttributes } from 'react'

type GlassPanelProps = {
  /** Severity-Akzent links als border-l-4. */
  accent?: 'navy' | 'ondo' | 'emerald' | 'amber' | 'rose' | null
  radius?: 'sm' | 'md' | 'lg'
  /** Zusätzliche Shadow-Stärke (default: shadow-ios-sm). */
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  padded?: boolean
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

const ACCENT_CLS = {
  navy: 'border-l-4 border-l-claimondo-navy',
  ondo: 'border-l-4 border-l-claimondo-ondo',
  emerald: 'border-l-4 border-l-emerald-500',
  amber: 'border-l-4 border-l-amber-500',
  rose: 'border-l-4 border-l-rose-500',
} as const

const RADIUS_CLS = {
  sm: 'rounded-ios-sm',
  md: 'rounded-ios-md',
  lg: 'rounded-ios-lg',
} as const

const SHADOW_CLS = {
  none: '',
  sm: 'shadow-ios-sm',
  md: 'shadow-ios-md',
  lg: 'shadow-ios-lg',
} as const

export function GlassPanel({
  accent,
  radius = 'md',
  shadow = 'sm',
  padded = false,
  className = '',
  children,
  ...rest
}: GlassPanelProps) {
  const accentCls = accent ? ACCENT_CLS[accent] : ''
  const pad = padded ? 'p-4' : ''
  return (
    <div
      className={`glass-light border border-claimondo-border ${RADIUS_CLS[radius]} ${SHADOW_CLS[shadow]} ${accentCls} ${pad} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
