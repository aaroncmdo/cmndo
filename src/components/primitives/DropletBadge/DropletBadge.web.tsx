'use client'
import { tokens } from '@/lib/design-tokens'
import type { DropletBadgeProps } from './DropletBadge.types'

export function DropletBadge({ count, tone = 'danger', size = 18 }: DropletBadgeProps) {
  if (count <= 0) return null
  const label = count > 99 ? '99+' : String(count)

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: size,
        height: size,
        paddingLeft: count >= 10 ? 4 : 0,
        paddingRight: count >= 10 ? 4 : 0,
        borderRadius: tokens.radius.full,
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
