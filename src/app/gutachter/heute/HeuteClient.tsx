'use client'

// Heute-Tab: Mapbox-Tagesroute zentral, rechts Termin-Liste mit Pflichtinfos.
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
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 p-4 h-[calc(100vh-100px)]">
      {/* Karte zentral — nimmt die meiste Fläche ein */}
      <div className="flex flex-col gap-3 min-h-[400px]">
        <div className="flex-1 min-h-[400px]">
          <TagesrouteMap
            svOrigin={origin}
            stops={stops}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TagesrouteStartCard
            terminIds={terminIds}
            hasActiveSession={hasActiveSession}
            disabledReason={disabledReason}
          />
          <div className="bg-white border border-claimondo-border rounded-xl p-3">
            <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider mb-1.5">
              Tagesvorbereitung
            </p>
            <TagesvorbereitungButton />
            <p className="text-[10px] text-claimondo-ondo/70 mt-1.5 leading-tight">
              CSV-Export für AutoiXpert / Audatex / Excel.
            </p>
          </div>
        </div>
      </div>

      {/* Termin-Liste rechts mit Pflicht-Infos */}
      <TagesrouteSidebar
        termine={termine}
        pflichtStats={pflichtStats}
        svOrigin={origin}
        activeStopId={activeStopId}
        onStopClick={setActiveStopId}
      />
    </div>
  )
}
