// AAR-769 Phase 3: GlassPanel ist jetzt ein dünner Wrapper über <Card>.
//
// Die alte Public-API (accent, radius, shadow, padded, className, ...rest)
// wird auf <Card>-Props gemappt. Aktuell hat keine externe Stelle die
// Component konsumiert (nur sich selbst), wird aber als Convenience-Export
// für „accent als Severity-Hint"-Use-Cases beibehalten.

import type { ReactNode, HTMLAttributes } from 'react'
import { Card } from '@/components/primitives'
import type {
  ColorName,
  RadiusName,
  ShadowName,
} from '@/lib/design-tokens'

type GlassPanelProps = {
  /** Severity-Akzent links als border-l-4. */
  accent?: 'navy' | 'ondo' | 'emerald' | 'amber' | 'rose' | null
  radius?: 'sm' | 'md' | 'lg'
  /** Zusätzliche Shadow-Stärke (default: shadow.sm). */
  shadow?: 'none' | 'sm' | 'md' | 'lg'
  padded?: boolean
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>

const ACCENT_TO_COLOR: Record<NonNullable<GlassPanelProps['accent']>, ColorName> = {
  navy: 'navy',
  ondo: 'ondo',
  emerald: 'success',
  amber: 'warning',
  rose: 'danger',
}

export function GlassPanel({
  accent,
  radius = 'md',
  shadow = 'sm',
  padded = false,
  className = '',
  children,
}: GlassPanelProps) {
  const accentColor = accent ? ACCENT_TO_COLOR[accent] : undefined
  // Shadow 'none' wird auf 'sm' gemappt (Card hat kein 'none'); für externes
  // Schatten-Reset müsste Consumer eigene Card direkt nutzen.
  const cardShadow: ShadowName = shadow === 'none' ? 'sm' : shadow
  const cardRadius: RadiusName = radius === 'sm' ? 'sm' : radius === 'lg' ? 'lg' : 'md'

  const inner = (
    <Card
      glass="light"
      accentColor={accentColor}
      radius={cardRadius}
      shadow={cardShadow}
      p={padded ? 4 : 0}
    >
      {children}
    </Card>
  )

  if (className) {
    return <div className={className}>{inner}</div>
  }
  return inner
}
