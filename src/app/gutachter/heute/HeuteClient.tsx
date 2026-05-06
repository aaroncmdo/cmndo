'use client'

// 2026-05-06: Kompletter Rewrite. Keine flex-row-Side-by-Side mehr,
// keine h-full-Chains, keine -m-* Negative-Margins, keine absolute-
// Positionierung. Stattdessen einfache vertikale Stapelung:
//
//   1. TagesrouteMap (Hero) — full-width, explizite Pixel-Höhe (60vh)
//   2. Tagesvorbereitung-Header (kompakter Streifen)
//   3. TagesrouteSidebar (Liste der Termine, normales Block-Layout)
//   4. TagesrouteStartCard (CTA-Button am Ende)
//
// Begründung: 6 vorherige Versuche eine side-by-side-Map auf voller
// Höhe zu rendern sind alle gescheitert (h-full-Chain, absolute inset-0,
// vh-min-h, JS-Messung, calc-inline, position:fixed). Mit Stapelung
// gibt's keinen Layout-Chain mehr — Map kriegt 60vh per inline-style,
// Browser parst das deterministisch, Mapbox-Container füllt korrekt.

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import TagesrouteSidebar, { type TagesroutePflichtStat } from './TagesrouteSidebar'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
import type { HeuteTerminFull } from './page'
import type { TagesrouteStop } from './TagesrouteMap'

const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
}

// Map-Höhe als Konstante — kann später zu prop/setting werden falls
// Density-Toggle gewünscht.
const MAP_HEIGHT_PX = 540

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
    <div className="space-y-4">
      {/* 1. Map als Hero — explizite Pixel-Höhe, full-width */}
      <TagesrouteMap
        svOrigin={origin}
        stops={stops}
        activeStopId={activeStopId}
        onStopClick={setActiveStopId}
        height={MAP_HEIGHT_PX}
      />

      {/* 2. Tagesvorbereitung-Header */}
      <div className="bg-white border border-claimondo-border rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-claimondo-navy">
        <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
        <TagesvorbereitungButton />
      </div>

      {/* 3. Termine-Liste — eigener Card mit normaler Höhe (kein flex-1) */}
      <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
        <TagesrouteSidebar
          termine={termine}
          pflichtStats={pflichtStats}
          svOrigin={origin}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
        />
      </div>

      {/* 4. Tagesroute-Start-Card am Ende */}
      <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
        <TagesrouteStartCard
          terminIds={terminIds}
          hasActiveSession={hasActiveSession}
          disabledReason={disabledReason}
        />
      </div>
    </div>
  )
}
