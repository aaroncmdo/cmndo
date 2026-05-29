// 13.05.2026 Sentry-Issue JAVASCRIPT-NEXTJS-2 (Digest 1699651472) Fix:
// StatCard war zuvor selbst 'use client' und nahm `icon: LucideIcon` als Prop.
// Wenn eine Server-Component das Cards-Array mit `icon: UsersIcon` (Function)
// spread'd an <StatCard {...c} />, ging die forwardRef-Function über die
// Server→Client-Grenze — Next.js wirft „Functions cannot be passed directly
// to Client Components". Auf /admin lief das 5 Events in 1 Minute hoch.
//
// Pattern wie EmptyState: Server-Wrapper rendert das Icon-JSX selbst (=
// serializable ReactNode), delegiert an StatCardClient. Konsumenten-API
// (StatCardProps mit icon: LucideIcon) bleibt unverändert — die 8 Caller
// müssen nichts anpassen.

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { StatCardClient, type StatCardTone } from './StatCardClient'

export type { StatCardTone }

export type StatCardProps = {
  label: string
  value: string | number
  icon?: LucideIcon
  tone?: StatCardTone
  /** Zusatzzeile unter dem Wert (z. B. „bezahlte Rechnungen") */
  hint?: ReactNode
  /** Macht die Kachel zu einem Link */
  href?: string
  /** 'md' (default) = große Dashboard-Kachel; 'sm' = kompakt für 2-/3-spaltige Grids */
  size?: 'md' | 'sm'
  className?: string
}

export function StatCard({
  label,
  value,
  icon: IconRef,
  tone = 'neutral',
  hint,
  href,
  size = 'md',
  className,
}: StatCardProps) {
  const iconSizeCls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const iconNode = IconRef ? <IconRef className={iconSizeCls} /> : undefined

  return (
    <StatCardClient
      label={label}
      value={value}
      iconNode={iconNode}
      tone={tone}
      hint={hint}
      href={href}
      size={size}
      className={className}
    />
  )
}
