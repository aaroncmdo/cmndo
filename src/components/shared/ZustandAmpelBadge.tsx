// B (Zustandsdoku): Ampel-Badge fuer die Zustandsdoku-Frische. Rein datengetrieben (Monate
// seit dem letzten Scan), KEINE Claim-/Phasen-Statusdomaene -> token-Farben direkt. In shared/
// = ausserhalb des status-registry-Scans (der ui/primitives/shared exemptet). Reused: Fahrzeug-
// Detail (Task 6) + Flotten-Liste (Task 7). Kein 'use client' -> in Server- + Client-Komponenten nutzbar.
import { badgeAmpel } from '@/lib/vehicles/zustand-perspektiven'

const AMPEL_CLS: Record<'gruen' | 'amber' | 'rot', string> = {
  gruen: 'bg-success-soft text-success-strong',
  amber: 'bg-warning-soft text-warning-strong',
  rot: 'bg-danger-soft text-danger-strong',
}

export function monateSeit(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44))
}

export function ZustandAmpelBadge({ letzterScanAm }: { letzterScanAm: string | null }) {
  const monate = monateSeit(letzterScanAm)
  const ampel = badgeAmpel(monate)
  const label =
    monate == null
      ? 'Zustand nie dokumentiert'
      : monate < 1
        ? 'Zustand aktuell dokumentiert'
        : `Zustand dokumentiert vor ${monate} Mon.`
  return (
    <span className={`inline-flex items-center rounded-ios-sm px-2 py-0.5 text-caption font-medium ${AMPEL_CLS[ampel]}`}>
      {label}
    </span>
  )
}
