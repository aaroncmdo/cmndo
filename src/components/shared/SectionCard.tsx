'use client'

// AAR-frontend-konsolidierung-p1: Zentrale Section-Card (weiße Card + optionaler
// Header mit Icon + Titel + Subtitle/Hint/Action). Ersetzt mehrere inline
// function Card/SectionCard (FRONTEND-REDUNDANZ-AUDIT R6). Token-gebunden
// (claimondo-* → var(--brand-*)).
//
// Hinweis: `icon` ist bewusst `ReactNode` (nicht LucideIcon) — die bestehenden
// Call-Sites geben bereits gestyltes <Icon className="w-4 h-4 …"/> hinein; das
// beizubehalten vermeidet ~20 risikoreiche Call-Site-Umbauten in der Fallakte.
// Das innere Layout (Feld-Grid, Spacing) bleibt Sache des Callers — entweder
// per `bodyClassName` oder direkt im Children-Markup.

import type { ReactNode } from 'react'

export type SectionCardProps = {
  title?: string
  icon?: ReactNode
  /** Zweite Header-Zeile (Kontext-Hinweis). */
  subtitle?: ReactNode
  /** Kurzer Hinweis rechts oben im Header. */
  hint?: ReactNode
  /** Rechts ausgerichtetes Header-Element (z. B. Button). */
  headerAction?: ReactNode
  children: ReactNode
  className?: string
  /** 'md' (default) = p-5; 'lg' = p-7 sm:p-8 */
  size?: 'md' | 'lg'
  /** Klassen für den Body-Wrapper (z. B. ein Feld-Grid). */
  bodyClassName?: string
}

export function SectionCard({
  title,
  icon,
  subtitle,
  hint,
  headerAction,
  children,
  className,
  size = 'md',
  bodyClassName,
}: SectionCardProps) {
  const pad = size === 'lg' ? 'p-7 sm:p-8' : 'p-5'
  const hasHeader = Boolean(title || icon || subtitle || headerAction)
  return (
    <div className={`rounded-xl border border-claimondo-border bg-white ${pad} ${className ?? ''}`}>
      {hasHeader ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {icon ?? null}
              {title ? (
                <h3 className="text-sm font-semibold text-claimondo-navy">{title}</h3>
              ) : null}
              {hint ? (
                <span className="ml-auto text-[10px] text-claimondo-ondo/70">{hint}</span>
              ) : null}
            </div>
            {subtitle ? (
              <p className="mt-0.5 text-[11px] text-claimondo-ondo">{subtitle}</p>
            ) : null}
          </div>
          {headerAction ? <div className="flex-shrink-0">{headerAction}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}
