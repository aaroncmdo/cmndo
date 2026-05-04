'use client'

// Heute-Tab: Mapbox füllt komplett, Cards (Tagesvorbereitung oben rechts,
// Termin-Liste mittig rechts mit interner Scroll-Höhe, Tagesroute-Start
// unten rechts) schweben darüber. Keine Page-Scrollbar — das Browser-
// Viewport bleibt fix, nur die Termin-Liste scrollt intern wenn lang.
// GPS opportunistisch — Fallback auf SV-Home-Basis (sachverstaendige.standort_*).

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import TagesrouteSidebar, { type TagesroutePflichtStat } from './TagesrouteSidebar'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
import type { HeuteTerminFull } from './page'
import type { TagesrouteStop } from './TagesrouteMap'

// Mapbox-Karte nur clientseitig laden (mapbox-gl referenziert window beim Import)
const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
}

export default function HeuteClient({
  termine,
  pflichtStats,
  svStandort,
  hasActiveSession,
}: HeuteClientProps) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    svStandort.lat != null && svStandort.lng != null
      ? { lat: svStandort.lat, lng: svStandort.lng }
      : null,
  )
  const [activeStopId, setActiveStopId] = useState<string | null>(null)

  // Opportunistisch GPS holen
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    )
  }, [])

  const aktiveTermine = useMemo(
    () => termine.filter((t) => t.status !== 'abgeschlossen' && t.status !== 'abgelehnt'),
    [termine],
  )
  const terminIds = aktiveTermine.map((t) => t.id)

  // Stops für die Karte: nur aktive Termine mit gültigen Koordinaten,
  // sortiert nach Startzeit
  const stops: TagesrouteStop[] = useMemo(() => {
    return [...aktiveTermine]
      .filter((t) => t.besichtigungsort_lat != null && t.besichtigungsort_lng != null)
      .sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())
      .map((t) => ({
        id: t.id,
        startIso: t.start_zeit,
        lat: t.besichtigungsort_lat as number,
        lng: t.besichtigungsort_lng as number,
        label: t.kunde_name,
      }))
  }, [aktiveTermine])

  const disabledReason = aktiveTermine.length === 0 ? 'Heute keine offenen Termine' : null

  return (
    <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden">
      {/* Mapbox füllt den ganzen Bereich */}
      <div className="absolute inset-0">
        <TagesrouteMap
          svOrigin={origin}
          stops={stops}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
        />
      </div>

      {/* Floating-Spalte rechts: Tagesvorbereitung oben, Termin-Liste mittig
          (scrollbar wenn lang), Tagesroute-Card unten. Alle Cards sind
          shadow-lg + bg-white/95 mit backdrop-blur damit sie über der Map
          gut lesbar sind. */}
      <div className="absolute top-4 right-4 bottom-4 z-10 w-[380px] max-w-[calc(100vw-2rem)] flex flex-col gap-3 pointer-events-none">
        {/* Tagesvorbereitung — oben, kompakt */}
        <div className="bg-white/95 backdrop-blur border border-claimondo-border rounded-xl px-3 py-2 shadow-lg flex items-center gap-2 text-xs text-claimondo-navy pointer-events-auto shrink-0">
          <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
          <TagesvorbereitungButton />
        </div>

        {/* Termin-Liste — füllt den Rest, scrollt intern */}
        <div className="flex-1 min-h-0 bg-white/95 backdrop-blur border border-claimondo-border rounded-xl shadow-lg overflow-hidden flex flex-col pointer-events-auto">
          <TagesrouteSidebar
            termine={termine}
            pflichtStats={pflichtStats}
            svOrigin={origin}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
          />
        </div>

        {/* Tagesroute-Start — unten */}
        <div className="bg-white/95 backdrop-blur border border-claimondo-border rounded-xl shadow-lg overflow-hidden pointer-events-auto shrink-0">
          <TagesrouteStartCard
            terminIds={terminIds}
            hasActiveSession={hasActiveSession}
            disabledReason={disabledReason}
          />
        </div>
      </div>
    </div>
  )
}
