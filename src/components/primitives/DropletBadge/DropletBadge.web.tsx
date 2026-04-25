'use client'
import { tokens } from '@/lib/design-tokens'
import type { DropletBadgeProps } from './DropletBadge.types'

// AAR-769 / AAR-775: Tropfenförmige Notification-Badge — Wassertropfen-
// Silhouette via asymmetrische border-radius. Spitze oben-links wenn die
// Form rotiert ist (45deg), aber wir wollen die Spitze oben-rechts damit
// das Badge an der oberen rechten Ecke einer Karte anhängen kann wie ein
// echter Tropfen.

export function DropletBadge({ count, tone = 'danger', size = 18 }: DropletBadgeProps) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)
  const wide = count >= 10
  // Mindestbreite proportional, mehrstellige Counts werden zu einer
  // pillen-förmigen Tropfenkapsel (Spitze rechts oben bleibt).
  const minWidth = wide ? size * 1.4 : size

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth,
        height: size,
        paddingLeft: wide ? 4 : 0,
        paddingRight: wide ? 4 : 0,
        // Wassertropfen: 3 runde Ecken + 1 spitze (oben rechts)
        borderRadius: `${tokens.radius.full}px ${size * 0.2}px ${tokens.radius.full}px ${tokens.radius.full}px`,
        backgroundColor: tokens.colors[tone],
        color: tokens.colors.white,
        fontSize: size <= 18 ? 10 : 11,
        fontWeight: 700,
        lineHeight: 1,
        boxShadow: tokens.shadow.sm,
      }}
      aria-label={`${label} ungelesen`}
    >
      {label}
    </span>
  )
}
