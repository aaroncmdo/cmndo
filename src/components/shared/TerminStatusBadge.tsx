import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Kanonische Status-Farben + Pill fuer gutachter_termine-Badges. Vorher 3x divergent
// gebaut (Liste/Detail/Fallakte) — u.a. war 'abgeschlossen' in der Liste grau, im Detail
// gruen. Kanonisch = gruen (positive Fertigstellung, wie die Detail-Ansicht). Label kommt
// vom Caller (i18n bleibt pro Site erhalten), Icon optional. Klassen sind token-basiert
// (brand-aware); Shell entspricht der reichhaltigeren Detail-Variante.
const STATUS_COLOR: Record<string, string> = {
  reserviert: 'bg-warning-soft text-warning-strong border-warning/30',
  bestaetigt: 'bg-success-soft text-success-strong border-success/30',
  gegenvorschlag: 'bg-warning-soft text-warning-strong border-warning/30',
  abgelehnt: 'bg-danger-soft text-danger-strong border-danger/30',
  abgesagt: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border',
  abgeschlossen: 'bg-success-soft text-success-strong border-success/30',
  // T1: Dead-Pin/noch-kein-SV — gleicher warning-Ton wie reserviert/gegenvorschlag (auch "noch nicht fix").
  dispatch_pending: 'bg-warning-soft text-warning-strong border-warning/30',
  sv_gesucht: 'bg-warning-soft text-warning-strong border-warning/30',
}

const FALLBACK_COLOR = 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border'

/** Nur die kanonischen Farbklassen fuer einen Termin-Status. */
export function terminStatusColor(status: string): string {
  return STATUS_COLOR[status] ?? FALLBACK_COLOR
}

/**
 * Kanonische Status-Pill fuer gutachter_termine. Farbe + Shape kanonisch; Label vom Caller
 * (i18n oder statisch), Icon optional. Vereinheitlicht die zuvor 3x divergent gebauten Badges.
 */
export function TerminStatusBadge({
  status,
  label,
  icon,
  className,
}: {
  status: string
  label: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        terminStatusColor(status),
        className,
      )}
    >
      {icon}
      {label}
    </span>
  )
}
