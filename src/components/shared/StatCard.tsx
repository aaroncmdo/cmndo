'use client'

// AAR-frontend-konsolidierung-p1: Zentrale Metrik-Kachel. Ersetzt 5 inline
// StatCard/KpiCard-Varianten (FRONTEND-REDUNDANZ-AUDIT R3). Token-gebunden über
// die claimondo-*-Klassen (globals.css → var(--brand-*)).
//
// Hinweis: Die primitives/* (Card/Box/Row/Stack/Text/Icon) haben bewusst KEINE
// className-API (strikt Token-Props) — eine halbtransparente Icon-Badge + freie
// Grid-Größen lassen sich damit nicht ausdrücken. Daher hier plain JSX mit
// Token-Klassen (Layout-/Theming-Utilities sind laut KOMPONENTEN-SET-POLICY
// weiterhin erlaubt — die Regel betrifft Komponenten, nicht Spacing/Farben).

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatCardTone =
  | 'navy'
  | 'ondo'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'

const ICON_BG: Record<StatCardTone, string> = {
  navy: 'bg-claimondo-navy/[0.06] text-claimondo-navy',
  ondo: 'bg-claimondo-ondo/10 text-claimondo-ondo',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
  neutral: 'bg-claimondo-bg text-claimondo-shield',
}

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
  const pad = size === 'sm' ? 'p-4' : 'p-5'
  const valueCls = size === 'sm' ? 'text-xl' : 'text-2xl'
  const iconBox = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'
  const iconSizeCls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  const body = (
    <div
      className={`rounded-ios-md border border-claimondo-border bg-white ${pad} shadow-ios-sm ${
        href ? 'transition-shadow hover:shadow-ios-md' : ''
      } ${className ?? ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-claimondo-ondo">
          {label}
        </p>
        {IconRef ? (
          <span
            className={`flex flex-shrink-0 items-center justify-center rounded-full ${iconBox} ${ICON_BG[tone]}`}
          >
            <IconRef className={iconSizeCls} />
          </span>
        ) : null}
      </div>
      <p className={`${valueCls} font-bold tabular-nums text-claimondo-navy`}>{value}</p>
      {hint != null ? (
        <p className="mt-1 text-[10px] text-claimondo-ondo/80">{hint}</p>
      ) : null}
    </div>
  )

  return href ? (
    <Link
      href={href}
      className="block rounded-ios-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo focus-visible:ring-offset-1"
    >
      {body}
    </Link>
  ) : (
    body
  )
}
