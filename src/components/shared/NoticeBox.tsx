import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// AAR Fallakte-Kanonisierung (2026-06-26): Kanonische Status-/Notice-Box.
// Vorher war das Pattern `<div className="bg-{warning,danger,success}-soft border
// border-X/30 text-X-strong …">` ~25× inline über die Fallakte-Portale (gutachter/
// kunde/admin) dupliziert. NoticeBox ist die Single Source of Truth fuer die
// Ton→Farb-Semantik (Token-Foundation); das Layout (Padding/Radius/Spacing) bleibt
// pro Call-Site via `className` steuerbar, damit die Migration bestehender Boxen
// visuell 1:1 ist. Composite-Layer-Komponente (@/components/shared, §Komponenten-Set).

export type NoticeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE_CLS: Record<NoticeTone, string> = {
  success: 'bg-success-soft border-success/30 text-success-strong',
  warning: 'bg-warning-soft border-warning/30 text-warning-strong',
  danger: 'bg-danger-soft border-danger/30 text-danger-strong',
  info: 'bg-info-soft border-info/30 text-info-strong',
  neutral: 'bg-claimondo-bg border-claimondo-border text-claimondo-navy',
}

export function NoticeBox({
  tone = 'warning',
  icon,
  className,
  children,
  ...rest
}: {
  /** Semantischer Status-Ton — bestimmt bg/border/text-Farbe (Token-Foundation). */
  tone?: NoticeTone
  /** Optionales Icon links (in einem flex-items-start-Wrapper). */
  icon?: ReactNode
  /** Layout-Overrides (Padding/Radius/Spacing) — Default: rounded-ios-lg px-3 py-2. */
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div className={cn('rounded-ios-lg border px-3 py-2', TONE_CLS[tone], className)} {...rest}>
      {icon ? (
        <div className="flex items-start gap-2">
          <span className="shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
