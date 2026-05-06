'use client'

// 2026-05-06: Side-by-Side-Cockpit auf Desktop, Stack auf Mobile.
//
// Aufbau:
//   - Mobile (< lg): vertikaler Stack — Map oben (540px), Termine-Liste,
//     Tagesvorbereitung-Header, Start-Card, alles full-width
//   - Desktop (lg+): flex-row — Map links flex-1, Termine-Spalte rechts
//     420px breit, beide Spalten mit calc(100vh - 130px) Höhe
//
// Map-Höhe ist die einzige Höhen-Quelle: `mapHeight` State wird je nach
// Viewport gesetzt (lg = calc-string, < lg = 540px). TagesrouteMap
// rendert das Element mit dieser inline-Höhe — kein Layout-Chain.

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import TagesrouteSidebar, { type TagesroutePflichtStat } from './TagesrouteSidebar'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
import type { HeuteTerminFull } from './page'
import type { RouteStats, TagesrouteStop } from './TagesrouteMap'

const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
}

const MAP_HEIGHT_MOBILE = 540

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
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null)

  // Viewport-Detection für Map-Höhe + Layout-Switch
  const [isLargeScreen, setIsLargeScreen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsLargeScreen(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsLargeScreen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

  // 2026-05-06: ALLE aktiven Termine als Stops durchreichen (inklusive
  // verlegt/verlegung_pending). TagesrouteMap rendert intern:
  //   - Active-Route (gold-solid): nur durch nicht-verlegte Stops
  //   - Verlegt-Stubs (dashed): straight-line vom Origin zu jedem verlegten
  // Damit sieht der SV: was die Route IST und was wäre gewesen.
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
        status: t.status,
      }))
  }, [aktiveTermine])

  const disabledReason = aktiveTermine.length === 0 ? 'Heute keine offenen Termine' : null

  // Map-Höhe je nach Viewport. Auf Desktop: 100% des fixed-Containers
  // (top-3 bottom-3 → calc(100vh - 24px) effektiv, aber via 100% einfacher).
  // Mobile: feste Pixel-Höhe.
  const mapHeight: number | string = isLargeScreen ? '100%' : MAP_HEIGHT_MOBILE

  return (
    // 2026-05-06: Auf Desktop (lg+) komplett aus dem Shell-Wrapping
    // ausbrechen via position:fixed — Map füllt den ganzen Content-
    // Bereich (Sidebar 256px + 12px Gap links, ansonsten bündig zum
    // navy-Outer). Mobile bleibt im normalen Flow als Stack.
    <div className="relative lg:fixed lg:top-3 lg:right-3 lg:bottom-3 lg:left-[268px]">
      {/* Map-Layer — full-width auf Desktop, voller Hintergrund */}
      <div className="lg:absolute lg:inset-0">
        <TagesrouteMap
          svOrigin={origin}
          stops={stops}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
          height={mapHeight}
          onRouteStatsChange={setRouteStats}
        />
      </div>

      {/* Termine-Overlay — Mobile: gestackt unter Map (mt-4).
          Desktop (lg+): floating absolute top-right über der Map. */}
      <div
        className="space-y-4 mt-4 lg:mt-0 lg:absolute lg:top-4 lg:right-4 lg:bottom-4 lg:w-[420px] lg:overflow-y-auto lg:z-10"
      >
        {/* Tagesvorbereitung-Header */}
        <div className="glass-light rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-claimondo-navy shadow-ios-md">
          <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
          <TagesvorbereitungButton />
        </div>

        {/* Termine-Liste */}
        <div className="glass-light rounded-xl overflow-hidden shadow-ios-md">
          <TagesrouteSidebar
            termine={termine}
            pflichtStats={pflichtStats}
            svOrigin={origin}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
          />
        </div>

        {/* Tagesroute-Start-Card */}
        <div className="rounded-xl overflow-hidden shadow-ios-md">
          <TagesrouteStartCard
            terminIds={terminIds}
            hasActiveSession={hasActiveSession}
            disabledReason={disabledReason}
            geschaetzteFahrzeitMinuten={routeStats?.dauerMin ?? null}
            distanzKm={routeStats?.distanzKm ?? null}
          />
        </div>
      </div>
    </div>
  )
}
