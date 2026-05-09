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
  /**
   * 2026-05-08 (C8): aktueller Browser-GPS-Standort des SV. Wird beim
   * Klick auf „Tagesmodus starten" als sachverstaendige.standort_lat/lng
   * persistiert, damit der Feldmodus die Initial-Camera auf den echten
   * Standort zentriert statt auf den (oft stale) Heimat-Standort.
   * null = GPS noch nicht da → Server-Action ohne Origin-Update.
   */
  origin?: { lat: number; lng: number } | null
  /**
   * Heute→Feldmodus-Intro: parallel zur Session-Erstellung läuft die Map-
   * Animation (Pitch 45→60, Zoom auf ersten Stop). Erst wenn beide fertig sind,
   * wird in den Feldmodus navigiert. Optional — fehlt das Handle, navigiert die
   * Card sofort wie zuvor.
   */
  onIntroAnimate?: () => Promise<void>
}

export default function TagesrouteStartCard({
  terminIds,
  hasActiveSession,
  disabledReason,
  geschaetzteFahrzeitMinuten = null,
  distanzKm = null,
  origin = null,
  onIntroAnimate,
}: TagesrouteStartCardProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const disabled = Boolean(disabledReason) || pending || terminIds.length === 0

  async function handleStart() {
    setPending(true)
    setError(null)
    // Animation parallel zur Server-Action — perceived latency bleibt minimal,
    // weil die Mapbox-Kamera während des DB-Writes schon tiltet.
    const animPromise = onIntroAnimate ? onIntroAnimate() : Promise.resolve()
    const res = await startOrResumeTagesSession(terminIds, origin)
    if (!res.success) {
      setPending(false)
      setError(res.error ?? 'Fehler beim Start')
      return
    }
    await animPromise
    router.push('/gutachter/feldmodus')
  }

  // 2026-05-08 Naming-Konsistenz: drei Begriffe ("Tagesroute starten",
  // "Fokus-Modus", "Tagesvorbereitung") wurden im Audit als verwirrend
  // identifiziert. „Tagesmodus" ist der gewählte Sammelbegriff für die
  // gesamte SV-Tagesfahrt (Heute → Anfahrt → Vor Ort → Abschluss).
  const label = hasActiveSession ? 'Tagesmodus fortsetzen' : 'Tagesmodus starten'

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
