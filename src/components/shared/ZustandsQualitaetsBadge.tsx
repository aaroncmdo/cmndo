// Z3: Foto-Qualitaets-Badge (Nutzbarkeit fuer die Schadenerkennung, 0-100 % + Ampel).
// Semantische Ampel, KEINE Claim-/Phasen-Statusdomaene -> token-Farben direkt; in shared/
// = ausserhalb des status-registry-Scans (analog ZustandAmpelBadge). Kein 'use client' ->
// in Server- + Client-Komponenten nutzbar. prozent null = nicht bewertet -> kein Badge.
import { ampelAusProzent } from '@/lib/vehicles/zustand-foto-qualitaet'

const AMPEL_CLS = {
  gruen: 'bg-success-soft text-success-strong',
  amber: 'bg-warning-soft text-warning-strong',
  rot: 'bg-danger-soft text-danger-strong',
} as const
const LED_CLS = { gruen: 'bg-success', amber: 'bg-warning', rot: 'bg-danger' } as const

export function ZustandsQualitaetsBadge({
  prozent,
  hinweis,
  className,
}: {
  prozent: number | null
  hinweis?: string | null
  className?: string
}) {
  if (prozent == null) return null
  const ampel = ampelAusProzent(prozent)
  return (
    <span
      title={hinweis ?? undefined}
      className={`inline-flex items-center gap-1 rounded-ios-sm px-1.5 py-0.5 text-caption font-semibold tabular-nums ${AMPEL_CLS[ampel]} ${className ?? ''}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${LED_CLS[ampel]}`} />
      {prozent}%
    </span>
  )
}
