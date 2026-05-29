// AAR-727 / AAR-769 Phase 3: Shared Hülle für „Jetzt zu tun"-Cards.
//
// SV (`JetztZuTunCard`) und Kunde (`KundeJetztZuTunCard`) haben komplett
// unterschiedliche Innenlogik (Task-Liste + Matrix-Resolver vs. Single-
// Action mit Severity-Varianten) — aber die gleiche Outer-Card-Struktur.
// Phase 3: Outer-Wrapper läuft jetzt über <Card> aus den Primitives.

import type { ReactNode } from 'react'
import { Card } from '@/components/primitives'
import type { ColorName } from '@/lib/design-tokens'

export type TodoCardSeverity =
  | 'default'
  | 'info'
  | 'warning'
  | 'critical'
  | 'success'

export interface TodoCardProps {
  /** Header-Label; Standard „Jetzt zu tun". */
  label?: string
  /** Wenn gesetzt, rechter Counter-Badge (z. B. „3 Tasks"). */
  count?: number | null
  /** Ersetzt den Count-Badge durch freien Text (Format: „X offen" o. ä.). */
  countLabel?: string | null
  /**
   * `default` → Claimondo-Navy-Accent (primärer Zustand).
   * `info` → neutral/muted (kein Handlungsbedarf).
   * `warning`/`critical` → Amber/Red Border-Accent.
   * `success` → Emerald (z. B. Live-Termin erfolgreich).
   */
  severity?: TodoCardSeverity
  /** Gedämpftes Rendering (gray-tönung, kein Accent). */
  passive?: boolean
  /** Card-Body. */
  children: ReactNode
  className?: string
}

// Severity → Token-Color für border-left-4 in <Card accentColor>.
const SEVERITY_ACCENT: Record<TodoCardSeverity, ColorName | undefined> = {
  default: 'navy',
  info: undefined,
  warning: 'warning',
  critical: 'danger',
  success: 'success',
}

export function TodoCard({
  label = 'Jetzt zu tun',
  count = null,
  countLabel = null,
  severity = 'default',
  passive = false,
  children,
  className = '',
}: TodoCardProps) {
  const accentColor = passive ? undefined : SEVERITY_ACCENT[severity]
  const isGlass = !passive && severity !== 'info'
  const hasHeader = label || count !== null || countLabel

  const counterText =
    countLabel ??
    (typeof count === 'number' ? `${count} ${count === 1 ? 'Task' : 'Tasks'}` : null)

  // className wird optional vom Consumer weitergegeben (z. B. zusätzliche
  // Spacing-/Margin-Klassen). Da <Card> selbst kein className entgegennimmt,
  // wrappen wir bei Bedarf in ein zusätzliches div.
  const inner = (
    <Card
      glass={isGlass ? 'light' : undefined}
      accentColor={accentColor}
      p={4}
    >
      {hasHeader && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-claimondo-ondo font-semibold">
            {label}
          </p>
          {counterText && (
            <span className="text-[10px] text-claimondo-ondo/70">{counterText}</span>
          )}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </Card>
  )

  if (className) {
    return <div className={className}>{inner}</div>
  }
  return inner
}

/**
 * Standard-Action-Body für Single-Action-Cards (z. B. Kunde + SV-Matrix).
 * Title fett + Beschreibung + optional Deadline + optional CTA.
 */
export function TodoCardActionBody({
  title,
  description,
  deadline,
  severity = 'default',
  cta,
}: {
  title: string
  description?: string | null
  deadline?: string | null
  severity?: TodoCardSeverity
  cta?: ReactNode
}) {
  const deadlineColor = {
    default: 'text-claimondo-ondo',
    info: 'text-claimondo-ondo',
    warning: 'text-amber-700',
    critical: 'text-red-700',
    success: 'text-emerald-700',
  }[severity]

  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-claimondo-navy">{title}</p>
      {description && (
        <p className="text-xs text-claimondo-ondo leading-relaxed">{description}</p>
      )}
      {deadline && (
        <p className={`text-[11px] mt-2 font-medium ${deadlineColor}`}>
          Frist: {deadline}
        </p>
      )}
      {cta && <div className="pt-2">{cta}</div>}
    </div>
  )
}
