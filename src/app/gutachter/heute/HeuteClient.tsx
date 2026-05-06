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
import type { TagesrouteStop } from './TagesrouteMap'

const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
}

const MAP_HEIGHT_MOBILE = 540
const COCKPIT_HEIGHT_DESKTOP = 'calc(100vh - 130px)'

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

  // Map-Höhe je nach Viewport. Auf Desktop: Cockpit-Mode (volle Restfläche).
  const mapHeight: number | string = isLargeScreen ? COCKPIT_HEIGHT_DESKTOP : MAP_HEIGHT_MOBILE

  // Sidebar-Höhe auf Desktop = identisch zur Map-Höhe damit beide
  // Spalten exakt am unteren Rand abschließen.
  const sidebarStyle = isLargeScreen ? { height: COCKPIT_HEIGHT_DESKTOP } : undefined

  return (
    <div className="lg:flex lg:flex-row lg:gap-4 space-y-4 lg:space-y-0">
      {/* Map-Spalte — Mobile: oben full-width. Desktop: links flex-1. */}
      <div className="lg:flex-1 lg:min-w-0">
        <TagesrouteMap
          svOrigin={origin}
          stops={stops}
          activeStopId={activeStopId}
          onStopClick={setActiveStopId}
          height={mapHeight}
        />
      </div>

      {/* Termine-Spalte — Mobile: Stack unten. Desktop: rechts 420px,
          eigene Scroll-Region damit Cards unabhängig von Page-Scroll. */}
      <div
        className="lg:w-[420px] lg:shrink-0 lg:overflow-y-auto space-y-4"
        style={sidebarStyle}
      >
        {/* Tagesvorbereitung-Header */}
        <div className="bg-white border border-claimondo-border rounded-xl px-3 py-2 flex items-center gap-2 text-xs text-claimondo-navy">
          <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
          <TagesvorbereitungButton />
        </div>

        {/* Termine-Liste */}
        <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
          <TagesrouteSidebar
            termine={termine}
            pflichtStats={pflichtStats}
            svOrigin={origin}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
          />
        </div>

        {/* Tagesroute-Start-Card */}
        <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
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
