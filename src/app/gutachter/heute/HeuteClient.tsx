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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import TagesrouteSidebar, { type TagesroutePflichtStat } from './TagesrouteSidebar'
import TagesrouteStartCard from './TagesrouteStartCard'
import TagesvorbereitungButton from '../auftraege/TagesvorbereitungButton'
import PrivatStopAddSheet from './PrivatStopAddSheet'
import GlassPanel from '@/components/shared/GlassPanel'
import { removePrivatStop, type PrivatStopRow } from './private-stops-actions'
import { toast } from 'sonner'
import type { HeuteTerminFull } from './page'
import type { RouteStats, TagesrouteMapHandle, TagesrouteStop } from './TagesrouteMap'

const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  hasActiveSession: boolean
  /** AAR-872: bereits gespeicherte Privat-Stops fuer heute. */
  initialPrivatStops: PrivatStopRow[]
}

const MAP_HEIGHT_MOBILE = 540

export default function HeuteClient({
  termine,
  pflichtStats,
  svStandort,
  hasActiveSession,
  initialPrivatStops,
}: HeuteClientProps) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(
    svStandort.lat != null && svStandort.lng != null
      ? { lat: svStandort.lat, lng: svStandort.lng }
      : null,
  )
  const [activeStopId, setActiveStopId] = useState<string | null>(null)
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null)

  // Heute→Feldmodus-Intro: Map exponiert ein Handle, StartCard ruft es vor
  // dem router.push, damit der Pitch-Tween (45→60, Zoom 11→15, Bearing zum
  // ersten Stop) als nahtlose Fortsetzung in den Feldmodus wirkt.
  const mapHandleRef = useRef<TagesrouteMapHandle | null>(null)
  const handleMapReady = useCallback((handle: TagesrouteMapHandle) => {
    mapHandleRef.current = handle
  }, [])
  const triggerIntroAnimation = useCallback(
    () => mapHandleRef.current?.animateIntro() ?? Promise.resolve(),
    [],
  )

  // AAR-872: Privat-Stops aus GCal/CalDAV. State im Client damit Add/Remove
  // sofort die Karte + Sidebar updaten ohne Server-Roundtrip.
  const [privatStops, setPrivatStops] = useState<PrivatStopRow[]>(initialPrivatStops)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const handlePrivatStopAdded = useCallback((stop: PrivatStopRow) => {
    setPrivatStops((prev) => {
      // Idempotent — wenn der Event schon drin ist, ersetzen, sonst pushen.
      const idx = prev.findIndex((p) => p.id === stop.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = stop
        return next
      }
      return [...prev, stop]
    })
  }, [])
  const handlePrivatStopRemove = useCallback(async (id: string) => {
    const prev = privatStops
    setPrivatStops((cur) => cur.filter((p) => p.id !== id))
    const res = await removePrivatStop(id)
    if (!res.ok) {
      toast.error(`Stop konnte nicht entfernt werden: ${res.error ?? 'Unbekannt'}`)
      setPrivatStops(prev) // rollback
    }
  }, [privatStops])
  const existingExternalIds = useMemo(
    () => new Set(privatStops.map((p) => p.external_event_id)),
    [privatStops],
  )

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
    const terminStops = [...aktiveTermine]
      .filter((t) => t.besichtigungsort_lat != null && t.besichtigungsort_lng != null)
      .map<TagesrouteStop>((t) => ({
        id: t.id,
        startIso: t.start_zeit,
        lat: t.besichtigungsort_lat as number,
        lng: t.besichtigungsort_lng as number,
        label: t.kunde_name,
        status: t.status,
      }))
    // AAR-872: Privat-Stops als status='privat'-Marker einreihen.
    const privatStopsAsRoute = privatStops.map<TagesrouteStop>((p) => ({
      id: `privat:${p.id}`,
      startIso: p.start_zeit,
      lat: p.lat,
      lng: p.lng,
      label: p.titel ?? 'Privat',
      status: 'privat',
    }))
    return [...terminStops, ...privatStopsAsRoute].sort(
      (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime(),
    )
  }, [aktiveTermine, privatStops])

  const disabledReason = aktiveTermine.length === 0 ? 'Heute keine offenen Termine' : null

  // Map-Höhe je nach Viewport. Auf Desktop: 100% des absolute-Containers
  // (= main-content-box-Höhe nach Banner). Mobile: feste Pixel-Höhe.
  const mapHeight: number | string = isLargeScreen ? '100%' : MAP_HEIGHT_MOBILE

  return (
    // 2026-05-06: Map = Background. Auf Desktop (lg+) füllt sie den
    // gesamten Bereich rechts der Sidebar (256px), bündig zu allen
    // Viewport-Kanten. Cards floaten oben-rechts darüber. Mobile: Stack.
    <div className="relative lg:fixed lg:top-0 lg:right-0 lg:bottom-0 lg:left-64 lg:z-10">
      {/* Map als Background — füllt den gesamten Container */}
      <TagesrouteMap
        svOrigin={origin}
        stops={stops}
        activeStopId={activeStopId}
        onStopClick={setActiveStopId}
        height={mapHeight}
        onRouteStatsChange={setRouteStats}
        onReady={handleMapReady}
      />

      {/* Termine-Overlay — Mobile: gestackt unter Map (mt-4).
          Desktop (lg+): floating absolute top-right über der Map.
          2026-05-06: alle Cards mit IDENTISCHEM Glassy-Style:
          bg-white/65 + backdrop-blur-xl + shadow-ios-md. Konsistenz. */}
      <div
        className="space-y-4 mt-4 lg:mt-0 lg:absolute lg:top-4 lg:right-4 lg:bottom-4 lg:w-[420px] lg:overflow-y-auto lg:z-10"
      >
        {/* Tagesvorbereitung-Header */}
        <GlassPanel className="px-3 py-2 flex items-center gap-2 text-xs text-claimondo-navy">
          <span className="font-medium whitespace-nowrap">Tagesvorbereitung:</span>
          <TagesvorbereitungButton />
        </GlassPanel>

        {/* Termine-Liste */}
        <GlassPanel className="overflow-hidden">
          <TagesrouteSidebar
            termine={termine}
            pflichtStats={pflichtStats}
            svOrigin={origin}
            activeStopId={activeStopId}
            onStopClick={setActiveStopId}
            privatStops={privatStops}
            onAddPrivatStop={() => setAddSheetOpen(true)}
            onRemovePrivatStop={handlePrivatStopRemove}
          />
        </GlassPanel>

        {/* Tagesroute-Start-Card — Wrapper glassy wie die anderen, Innen behält
            die Card ihren Navy-Akzent für den CTA-Look. */}
        <GlassPanel className="overflow-hidden">
          <TagesrouteStartCard
            terminIds={terminIds}
            hasActiveSession={hasActiveSession}
            disabledReason={disabledReason}
            geschaetzteFahrzeitMinuten={routeStats?.dauerMin ?? null}
            distanzKm={routeStats?.distanzKm ?? null}
            origin={origin}
            onIntroAnimate={triggerIntroAnimation}
          />
        </GlassPanel>
      </div>

      <PrivatStopAddSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        existingExternalIds={existingExternalIds}
        onAdded={handlePrivatStopAdded}
      />
    </div>
  )
}
