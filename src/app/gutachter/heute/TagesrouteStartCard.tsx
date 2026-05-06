'use client'

// AAR-381: „Tagesroute starten" — Einstieg in den Fokus-Modus (AAR-382).
// Ruft ensureTagesSession und navigiert zu /gutachter/feldmodus.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapIcon, PlayCircleIcon } from 'lucide-react'
import { startOrResumeTagesSession } from './actions'

export interface TagesrouteStartCardProps {
  terminIds: string[]
  /** Falls bereits laufende Session existiert: label-Switch. */
  hasActiveSession: boolean
  /** Disabled wenn keine aktiven Termine oder Portal nicht freigeschaltet. */
  disabledReason?: string | null
  /** Grobe Schätzung der Fahrzeit (Minuten) — null zeigt einfach Stop-Count. */
  geschaetzteFahrzeitMinuten?: number | null
  /** 2026-05-06: Live-Distanz aus Mapbox-Directions, optional. */
  distanzKm?: number | null
}

export default function TagesrouteStartCard({
  terminIds,
  hasActiveSession,
  disabledReason,
  geschaetzteFahrzeitMinuten = null,
  distanzKm = null,
}: TagesrouteStartCardProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = Boolean(disabledReason) || pending || terminIds.length === 0

  async function handleStart() {
    setPending(true)
    setError(null)
    const res = await startOrResumeTagesSession(terminIds)
    setPending(false)
    if (!res.success) {
      setError(res.error ?? 'Fehler beim Start')
      return
    }
    router.push('/gutachter/feldmodus')
  }

  const label = hasActiveSession
    ? 'Fokus-Modus fortsetzen'
    : 'Tagesroute starten'

  // 2026-05-06: Mit Distanz-Anteil falls vorhanden — „3 Stops · 87 km · 4h 20min"
  const subLabelParts: string[] = [`${terminIds.length} Stop${terminIds.length === 1 ? '' : 's'}`]
  if (distanzKm != null && distanzKm > 0) {
    subLabelParts.push(`${distanzKm.toFixed(1)} km`)
  }
  if (geschaetzteFahrzeitMinuten != null && geschaetzteFahrzeitMinuten > 0) {
    const h = Math.floor(geschaetzteFahrzeitMinuten / 60)
    const m = geschaetzteFahrzeitMinuten % 60
    subLabelParts.push(h > 0 ? `${h}h ${m}min` : `${m} min`)
  }
  const subLabel = subLabelParts.join(' · ')

  return (
    // 2026-05-06: Card-Innen transparent — Wrapper im HeuteClient bringt
    // den glassy-Look. Hier nur Padding + Text + Button.
    <div className="p-4">
      <div className="flex items-center gap-2 mb-2 text-claimondo-navy">
        <MapIcon className="w-4 h-4" />
        <h3 className="text-sm font-semibold">Tagesroute</h3>
      </div>
      <p className="text-xs text-claimondo-ondo mb-3">{subLabel}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={handleStart}
        title={disabledReason ?? undefined}
        className={`w-full inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
          disabled
            ? 'bg-claimondo-border/40 text-claimondo-ondo/50 cursor-not-allowed'
            : 'bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white shadow-ios-sm'
        }`}
      >
        <PlayCircleIcon className="w-4 h-4" />
        {pending ? 'Starte …' : label}
      </button>
      {error && (
        <p className="text-[11px] text-red-600 mt-2">Fehler: {error}</p>
      )}
    </div>
  )
}
