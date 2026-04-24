// Shared-Pill für Status-Anzeigen (farbiges rounded-full Label).
// Ersetzt inline `rounded-full bg-*-100 text-*-700`-Duplikate.

import type { ReactNode } from 'react'

export type StatusBadgeTone =
  | 'neutral'    // grau — unbekannt/default
  | 'info'       // blau — informativ
  | 'success'    // grün — erfolgreich/bezahlt/bestätigt
  | 'warning'    // amber — Achtung/pending
  | 'danger'     // rose — Fehler/abgelehnt/storniert
  | 'brand'      // claimondo-navy — primäre Aktion
  | 'ondo'       // claimondo-ondo — sekundäre Aktion/aktiv

const TONE_CLS: Record<StatusBadgeTone, string> = {
  neutral: 'bg-[#f8f9fb] text-claimondo-navy',
  info: 'bg-claimondo-ondo/20 text-claimondo-navy',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-rose-100 text-rose-700',
  brand: 'bg-claimondo-navy/10 text-claimondo-navy',
  ondo: 'bg-claimondo-ondo/10 text-claimondo-ondo',
}

type StatusBadgeProps = {
  tone?: StatusBadgeTone
  size?: 'xs' | 'sm'
  /** Eigene Tailwind-Klassen — überschreiben tone. Nützlich für Edge-Cases. */
  colorCls?: string
  className?: string
  children: ReactNode
}

export function StatusBadge({
  tone = 'neutral',
  size = 'xs',
  colorCls,
  className = '',
  children,
}: StatusBadgeProps) {
  const sizeCls = size === 'xs'
    ? 'text-[10px] px-2 py-0.5'
    : 'text-xs px-2.5 py-1'
  const colors = colorCls ?? TONE_CLS[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeCls} ${colors} ${className}`}
    >
      {children}
    </span>
  )
}
