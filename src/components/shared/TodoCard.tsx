// AAR-727 Kandidat 2: Shared Hülle für „Jetzt zu tun"-Cards.
//
// SV (`JetztZuTunCard`) und Kunde (`KundeJetztZuTunCard`) haben komplett
// unterschiedliche Innenlogik (Task-Liste + Matrix-Resolver vs. Single-
// Action mit Severity-Varianten) — aber die gleiche Outer-Card-Struktur:
//   - Label-Header („Jetzt zu tun") ± Counter-Badge rechts
//   - optionaler Severity-Border-Accent links (critical/warning/success)
//   - Card-Surface (glass-light oder passive-muted)
//
// Diese Shell liefert NUR diese Hülle. Business-Logik bleibt beim Consumer.

import type { ReactNode } from 'react'

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

const SEVERITY_ACCENT: Record<TodoCardSeverity, string> = {
  default: 'border-l-claimondo-navy',
  info: 'border-l-transparent',
  warning: 'border-l-amber-500',
  critical: 'border-l-rose-500',
  success: 'border-l-emerald-500',
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
  const surface = passive
    ? 'bg-[#f8f9fb]/80 border-claimondo-border'
    : severity === 'info'
      ? 'bg-white border-claimondo-border'
      : 'glass-light'
  const accent = passive ? 'border-l-transparent' : SEVERITY_ACCENT[severity]
  const hasHeader = label || count !== null || countLabel

  const counterText =
    countLabel ??
    (typeof count === 'number' ? `${count} ${count === 1 ? 'Task' : 'Tasks'}` : null)

  return (
    <div
      className={`${surface} border border-l-4 ${accent} rounded-ios-md shadow-ios-sm p-4 sm:p-5 space-y-3 ${className}`}
      role="region"
      aria-label={label}
    >
      {hasHeader && (
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-claimondo-ondo font-semibold">
            {label}
          </p>
          {counterText && (
            <span className="text-[10px] text-claimondo-ondo/70">{counterText}</span>
          )}
        </div>
      )}
      {children}
    </div>
  )
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
    critical: 'text-rose-700',
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
