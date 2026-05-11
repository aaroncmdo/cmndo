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
import type { HeuteTerminFull } from './page'
import type { RouteStats, TagesrouteMapHandle, TagesrouteStop } from './TagesrouteMap'

const TagesrouteMap = dynamic(() => import('./TagesrouteMap'), { ssr: false })

export interface HeuteClientProps {
  termine: HeuteTerminFull[]
  pflichtStats: TagesroutePflichtStat[]
  svStandort: { lat: number | null; lng: number | null }
  /** 2026-05-08: Isochrone-Polygon des SV. Wenn Toggle „Mein Gebiet"
   *  in Einstellungen aktiv (LocalStorage), rendert TagesrouteMap das
   *  als leuchtende Grenz-Fläche um den Heimat-Standort. */
  isochronePolygon: Array<{ lat: number; lng: number }> | null
  hasActiveSession: boolean
  /** AAR-872: bereits gespeicherte Privat-Stops fuer heute. */
  initialPrivatStops: PrivatStopRow[]
}

const MAP_HEIGHT_MOBILE = 540

export default function HeuteClient({
  termine,
  pflichtStats,
  svStandort,
  isochronePolygon,
  hasActiveSession,
  initialPrivatStops,
}: HeuteClientProps) {
  // 2026-05-08 Aaron-Toggle: LocalStorage `claimondo_show_gebiet_in_hub`
  // entscheidet ob das Isochrone-Polygon gerendert wird. Initial-Read
  // sync (kein Flicker), zusätzlich Listener auf custom-event vom
  // Settings-Toggle damit sofortiges Update ohne Page-Reload.
  const [showGebiet, setShowGebiet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    // Default: sichtbar — nur ausblenden wenn explizit auf '0' gesetzt.
    return window.localStorage.getItem('claimondo_show_gebiet_in_hub') !== '0'
  })
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail
      if (typeof detail === 'boolean') setShowGebiet(detail)
    }
    window.addEventListener('claimondo:gebiet-toggle', handler)
    return () => window.removeEventListener('claimondo:gebiet-toggle', handler)
  }, [])
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

  // 2026-05-08 Aaron-Brief: Pre-Render-Warmup für Feldmodus. Nach 3 s
  // im Hub fetchen wir Mapbox-Standard-Style + die ersten Tiles um den
  // SV-Standort. Dank Service-Worker-Cache (TILE_CACHE) sind die beim
  // Klick auf „Tagesmodus starten" sofort verfügbar — Map rendert ohne
  // Tile-Pop-In. Origin-Header und Auth nicht nötig (Mapbox-Style ist
  // public mit access_token-Param).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!origin) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return
    const tid = window.setTimeout(() => {
      // Style + Sprite (~50 KB) — der Style-File listet alle Layer
      void fetch(`https://api.mapbox.com/styles/v1/mapbox/standard?access_token=${token}`).catch(() => {})
      // Tile-Indices um die Origin: zoom 13/14 abdecken die normale
      // Hub→Feldmodus-Anfangsphase. ~6 Tiles pro Zoom-Stufe ausreichend.
      const lng2tile = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * Math.pow(2, z))
      const lat2tile = (lat: number, z: number) => {
        const r = (lat * Math.PI) / 180
        return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z))
      }
      for (const z of [13, 14, 16]) {
        const x0 = lng2tile(origin.lng, z)
        const y0 = lat2tile(origin.lat, z)
        for (const dx of [-1, 0, 1]) {
          for (const dy of [-1, 0, 1]) {
            void fetch(
              `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x0 + dx}/${y0 + dy}.webp?sku=101&access_token=${token}`,
            ).catch(() => {})
          }
        }
      }
    }, 3_000)
    return () => window.clearTimeout(tid)
  }, [origin])

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
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-4">
      {/* Linke Spalte: Tageskalender-Rail */}
      <div className="bg-white border border-claimondo-border rounded-xl p-4 overflow-y-auto max-h-[calc(100vh-180px)]">
        <h2 className="text-sm font-semibold text-claimondo-navy mb-3">
          Tageskalender
        </h2>
        <TageskalenderRail termine={termine} svOrigin={origin} />
      </div>

      {/* Rechte Spalte: KPIs + Start-Karte */}
      <div className="space-y-3">
        <TagesrouteStartCard
          terminIds={terminIds}
          hasActiveSession={hasActiveSession}
          disabledReason={disabledReason}
        />
        <div className="bg-white border border-claimondo-border rounded-xl p-4">
          <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider">
            Termine heute
          </p>
          <p className="text-2xl font-semibold text-claimondo-navy mt-1">
            {aktiveTermine.length}
          </p>
        </div>
        {/* Aaron 2026-04-30: Tagesvorbereitung-Export auch hier auf Heute-Seite */}
        <div className="bg-white border border-claimondo-border rounded-xl p-4">
          <p className="text-[10px] text-claimondo-ondo uppercase tracking-wider mb-2">
            Tagesvorbereitung
          </p>
          <TagesvorbereitungButton />
          <p className="text-[10px] text-claimondo-ondo/70 mt-2 leading-tight">
            CSV mit allen Stammdaten der Tagestermine — Import in
            AutoiXpert / Audatex / Excel.
          </p>
        </div>
      </div>
    </div>
  )
}
