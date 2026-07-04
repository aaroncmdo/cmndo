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
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger-strong',
  neutral: 'bg-claimondo-bg text-claimondo-shield',
}

const TONE_TEXT: Record<StatCardTone, string> = {
  navy: 'text-claimondo-navy',
  ondo: 'text-claimondo-ondo',
  success: 'text-success-strong',
  warning: 'text-warning-strong',
  danger: 'text-danger-strong',
  neutral: 'text-claimondo-navy',
}

// Voll-getoente Alert-KPI-Variante (filled): getoenter Card-Hintergrund + Border + Zahl
// (statt weiss + navy). Fuer prominente Status-Kacheln wie SLA "Verletzt" — bewahrt die
// Alert-Prominenz, die ein neutrales StatCard neutralisieren wuerde.
const TONE_FILL_CARD: Record<StatCardTone, string> = {
  navy: 'border-claimondo-navy/20 bg-claimondo-navy/[0.04]',
  ondo: 'border-claimondo-ondo/20 bg-claimondo-ondo/5',
  success: 'border-success/30 bg-success-soft',
  warning: 'border-warning/30 bg-warning-soft',
  danger: 'border-danger/30 bg-danger-soft',
  neutral: 'border-claimondo-border bg-claimondo-bg',
}

export type StatCardClientProps = {
  label: string
  value: string | number
  /** Bereits zu JSX gerendertes Icon (LucideIcon-Function darf nicht über die
   * Server→Client-Grenze passen — Server-Wrapper StatCard rendert das Icon
   * mit der passenden iconSize-Class vor und reicht es als ReactNode hier rein). */
  iconNode?: ReactNode
  tone?: StatCardTone
  /** Voll-getoente Alert-Variante: getoenter Card-Hintergrund + Zahl (fuer prominente Status-KPIs). */
  filled?: boolean
  /** Zusatzzeile unter dem Wert (z. B. „bezahlte Rechnungen") */
  hint?: ReactNode
  /** Macht die Kachel zu einem Link */
  href?: string
  /** 'md' (default) = große Dashboard-Kachel; 'sm' = kompakt für 2-/3-spaltige Grids */
  size?: 'md' | 'sm'
  className?: string
}

export function StatCardClient({
  label,
  value,
  iconNode,
  tone = 'neutral',
  filled = false,
  hint,
  href,
  size = 'md',
  className,
}: StatCardClientProps) {
  const pad = size === 'sm' ? 'p-4' : 'p-5'
  const valueCls = size === 'sm' ? 'text-xl' : 'text-2xl'
  const iconBox = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'

  const body = (
    <div
      className={`rounded-ios-md border ${pad} shadow-ios-sm ${
        filled ? TONE_FILL_CARD[tone] : 'border-claimondo-border bg-white'
      } ${href ? 'transition-shadow hover:shadow-ios-md' : ''} ${className ?? ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-claimondo-ondo">
          {label}
        </p>
        {iconNode ? (
          <span
            className={`flex flex-shrink-0 items-center justify-center rounded-full ${iconBox} ${filled ? `bg-white ${TONE_TEXT[tone]}` : ICON_BG[tone]}`}
          >
            {iconNode}
          </span>
        ) : null}
      </div>
      <p className={`${valueCls} font-bold tabular-nums ${filled ? TONE_TEXT[tone] : 'text-claimondo-navy'}`}>{value}</p>
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
