'use client'

// 2026-05-06 (kompletter Rewrite): Wrapper-Bug fix.
//
// VORHER: outer div (relative, w-full, height-style) + inner div
// (absolute inset-0) als Mapbox-Container. Mapbox-Init las den Inner-
// Container aus, aber der war zwischen Mount und Style-Application
// inkonsistent → Canvas blieb klein.
//
// JETZT: containerRef direkt auf die EINZIGE Wrapper-Div. Inline-style
// height. Keine Verschachtelung mehr. Mapbox attached seine Canvas
// direkt in diese Div, deren Größe von Anfang an deterministisch ist.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ensureMapboxInitialized,
  mapboxgl,
  addSvCarMarker,
  addKundeMarker,
  upsertRouteLayer,
  removeRouteLayer,
  MAPBOX_STYLE_STANDARD_SATELLITE,
  getMapboxLightPreset,
} from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import { NavigationIcon } from 'lucide-react'

export type TagesrouteStop = {
  id: string
  startIso: string
  lat: number
  lng: number
  label: string
  /** Status für Marker-Farbe (bestaetigt → grün, reserviert → amber etc.) */
  status?: string
}

export type RouteStats = { distanzKm: number; dauerMin: number; stops: number }

/**
 * Imperatives Handle für den Heute→Feldmodus-Übergang. Parent ruft
 * animateIntro() auf, bevor er per router.push in den Feldmodus navigiert —
 * die Heute-Map zoomt + tiltet auf Pitch 60 mit Bearing zum ersten Stop, sodass
 * der Wechsel als ein durchgehender Kamera-Zug wirkt.
 */
export type TagesrouteMapHandle = {
  animateIntro: () => Promise<void>
}

export type TagesrouteMapProps = {
  svOrigin: { lat: number; lng: number } | null
  stops: TagesrouteStop[]
  activeStopId?: string | null
  onStopClick?: (stopId: string) => void
  /** Pflicht — Pixel-Höhe in Number oder CSS-String */
  height: number | string
  /** 2026-05-06: Lift Route-Stats nach oben damit StartCard sie nutzen kann */
  onRouteStatsChange?: (stats: RouteStats | null) => void
  /** Handle für Heute→Feldmodus-Intro-Animation. Wird einmal nach Mount gerufen. */
  onReady?: (handle: TagesrouteMapHandle) => void
}

/** Initial-Bearing zwischen zwei LngLat-Punkten (Grad, 0=Nord, im Uhrzeigersinn). */
function computeBearing(
  from: [number, number],
  to: [number, number],
): number {
  const φ1 = (from[1] * Math.PI) / 180
  const φ2 = (to[1] * Math.PI) / 180
  const Δλ = ((to[0] - from[0]) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

async function fetchMultiStopRoute(
  origin: { lat: number; lng: number },
  stops: TagesrouteStop[],
): Promise<{ coords: Array<[number, number]>; distanzKm: number; dauerMin: number } | null> {
  if (!MAPBOX_TOKEN || stops.length === 0) return null
  const allPoints: Array<[number, number]> = [
    [origin.lng, origin.lat],
    ...stops.map<[number, number]>((s) => [s.lng, s.lat]),
  ]
  const coordsParam = allPoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordsParam}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    const route = data?.routes?.[0]
    if (!route) return null
    const coords = (route.geometry?.coordinates ?? []) as Array<[number, number]>
    return {
      coords,
      distanzKm: Math.round((route.distance ?? 0) / 100) / 10,
      dauerMin: Math.round((route.duration ?? 0) / 60),
    }
  } catch {
    return null
  }
}

export default function TagesrouteMap({
  svOrigin,
  stops,
  activeStopId,
  onStopClick,
  height,
  onRouteStatsChange,
  onReady,
}: TagesrouteMapProps) {
  // EINE Ref. Mapbox attached sein Canvas direkt in diesem Element.
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const svMarkerRef = useRef<Marker | null>(null)
  const stopMarkersRef = useRef<Map<string, Marker>>(new Map())
  const [tokenMissing, setTokenMissing] = useState(false)
  const [routeStats, setRouteStats] = useState<{ distanzKm: number; dauerMin: number } | null>(null)

  // Live-Refs für die Intro-Animation: das Handle wird einmal nach Mount
  // exponiert und liest svOrigin/aktivStops über diese Refs aus.
  const svOriginRef = useRef(svOrigin)
  const aktivStopsRef = useRef<TagesrouteStop[]>([])

  const validStops = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null), [stops])

  // Active-only: verlegte Stops aus Route-Berechnung raus, bleiben aber
  // als graue Marker auf der Karte sichtbar.
  const aktivStops = useMemo(
    () =>
      validStops.filter(
        (s) => s.status !== 'verlegt' && s.status !== 'verlegung_pending',
      ),
    [validStops],
  )

  // Refs synchron halten, damit das Intro-Handle immer den aktuellen Stand sieht.
  useEffect(() => { svOriginRef.current = svOrigin }, [svOrigin])
  useEffect(() => { aktivStopsRef.current = aktivStops }, [aktivStops])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!ensureMapboxInitialized()) {
      setTokenMissing(true)
      return
    }

    const fallbackCenter: [number, number] = (() => {
      if (svOrigin) return [svOrigin.lng, svOrigin.lat]
      if (validStops.length > 0) return [validStops[0].lng, validStops[0].lat]
      return [10.4515, 51.1657]
    })()

    const map = new mapboxgl.Map({
      container: el, // direkt das wrapper-Element
      style: MAPBOX_STYLE_STANDARD_SATELLITE,
      center: fallbackCenter,
      zoom: 11,
      pitch: 45,
      bearing: 0,
      attributionControl: false,
    })

    const applyLightPreset = () => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', getMapboxLightPreset())
        map.setConfigProperty('basemap', 'show3dObjects', true)
        // 2026-05-07: Hyperrealismus-Boost — Standard-Satellite-Style
        // bekommt zusaetzlich Strassen-Decorations + POI-Labels + Place-
        // Labels. Die Defaults sind true, aber explizit setzen vermeidet
        // Drift wenn Mapbox die Defaults aendert.
        map.setConfigProperty('basemap', 'showRoadLabels', true)
        map.setConfigProperty('basemap', 'showPlaceLabels', true)
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', true)
        map.setConfigProperty('basemap', 'showTransitLabels', true)
      } catch { /* noop */ }
    }
    map.on('style.load', applyLightPreset)
    const presetTick = setInterval(applyLightPreset, 5 * 60_000)

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right',
    )

    mapRef.current = map

    const ro = new ResizeObserver(() => {
      try { map.resize() } catch { /* noop */ }
    })
    ro.observe(el)
    const onWindowResize = () => {
      try { map.resize() } catch { /* noop */ }
    }
    window.addEventListener('resize', onWindowResize)

    // 2026-05-06: Belt-and-Suspenders gegen den Initial-Render-Bug —
    // ResizeObserver feuert NICHT zuverlässig wenn der Container schon
    // beim Mount eine endgültige Größe hat (kein „resize" stattfindet).
    // Heute-Page Symptom: Canvas bleibt bei ~80-150px stehen obwohl
    // Container bei 800px+ ist. Mehrfach-Resize über RAF + setTimeout
    // erzwingt Canvas-Sync auf die tatsächliche Container-Größe nach
    // Layout-Settling.
    const forceResize = () => {
      try { map.resize() } catch { /* noop */ }
    }
    requestAnimationFrame(forceResize)
    const t1 = setTimeout(forceResize, 100)
    const t2 = setTimeout(forceResize, 500)
    const t3 = setTimeout(forceResize, 1500)

    return () => {
      clearInterval(presetTick)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      ro.disconnect()
      window.removeEventListener('resize', onWindowResize)
      svMarkerRef.current?.remove()
      svMarkerRef.current = null
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resize wenn height-Prop wechselt
  useEffect(() => {
    const m = mapRef.current
    if (m) try { m.resize() } catch { /* noop */ }
  }, [height])

  // SV-Marker
  useEffect(() => {
    const map = mapRef.current
    if (!map || !svOrigin) return
    const place = () => {
      if (!svMarkerRef.current) {
        svMarkerRef.current = addSvCarMarker(map, [svOrigin.lng, svOrigin.lat], { heading: null })
      } else {
        svMarkerRef.current.setLngLat([svOrigin.lng, svOrigin.lat])
      }
    }
    if (map.isStyleLoaded()) place()
    else map.once('load', place)
  }, [svOrigin])

  // Stop-Marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const place = () => {
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current.clear()
      validStops.forEach((stop, idx) => {
        const m = addKundeMarker(map, [stop.lng, stop.lat], {
          initials: String(idx + 1),
          status: stop.status,
        })
        const el = m.getElement()
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => onStopClick?.(stop.id))
        stopMarkersRef.current.set(stop.id, m)
      })
    }
    if (map.isStyleLoaded()) place()
    else map.once('load', place)
  }, [validStops, onStopClick])

  // Route-Rendering:
  //   Eine einzige navy Route durch alle aktiven (nicht-verlegten) Stops.
  //   Verlegte Termine fliegen komplett aus der Route — ihre Pins bleiben
  //   aber via validStops als graue Marker sichtbar.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!svOrigin || aktivStops.length === 0) {
      setRouteStats(null)
      onRouteStatsChange?.(null)
      if (map.isStyleLoaded()) {
        removeRouteLayer(map, 'main')
      }
      return
    }
    let cancelled = false

    fetchMultiStopRoute(svOrigin, aktivStops).then((aktivRoute) => {
      if (cancelled || !mapRef.current) return
      const draw = () => {
        const m = mapRef.current
        if (!m) return

        const aktivCoords =
          aktivRoute?.coords && aktivRoute.coords.length > 1
            ? aktivRoute.coords
            : [
                [svOrigin.lng, svOrigin.lat] as [number, number],
                ...aktivStops.map<[number, number]>((s) => [s.lng, s.lat]),
              ]

        upsertRouteLayer(m, aktivCoords, 'main')

        // Stats kommen immer von der aktiven Route (das ist die echte Tagesroute)
        if (aktivRoute && aktivRoute.coords.length > 1) {
          const stats = { distanzKm: aktivRoute.distanzKm, dauerMin: aktivRoute.dauerMin }
          setRouteStats(stats)
          onRouteStatsChange?.({ ...stats, stops: aktivStops.length })
        } else {
          setRouteStats(null)
          onRouteStatsChange?.(null)
        }

        // fitBounds berücksichtigt ALLE Stops (auch verlegte) damit graue
        // Pins nicht aus dem Viewport rutschen.
        const bounds = new mapboxgl.LngLatBounds()
        if (aktivRoute && aktivRoute.coords.length > 1) {
          for (const c of aktivRoute.coords) bounds.extend(c)
        } else {
          bounds.extend([svOrigin.lng, svOrigin.lat])
          aktivStops.forEach((s) => bounds.extend([s.lng, s.lat]))
        }
        validStops.forEach((s) => bounds.extend([s.lng, s.lat]))
        m.fitBounds(bounds, {
          padding: { top: 60, right: 60, bottom: 60, left: 60 },
          duration: 800,
          maxZoom: 14,
          pitch: 45,
        })
      }
      if (mapRef.current.isStyleLoaded()) draw()
      else mapRef.current.once('load', draw)
    })

    return () => { cancelled = true }
  }, [svOrigin, aktivStops, validStops, onRouteStatsChange])

  // Intro-Handle für Heute→Feldmodus-Übergang: nach Mount einmalig
  // exponieren. Animiert auf Pitch 60 + Zoom 15 mit Bearing zum ersten
  // aktiven Stop, sodass FeldmodusMap (das ebenfalls bei Pitch 60 startet)
  // visuell als nahtlose Fortsetzung wirkt.
  useEffect(() => {
    if (!onReady) return
    const handle: TagesrouteMapHandle = {
      animateIntro: () =>
        new Promise<void>((resolve) => {
          const map = mapRef.current
          const svO = svOriginRef.current
          const stopsList = [...aktivStopsRef.current].sort(
            (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime(),
          )
          const firstStop = stopsList[0]
          if (!map || !svO || !firstStop) {
            resolve()
            return
          }
          const from: [number, number] = [svO.lng, svO.lat]
          const to: [number, number] = [firstStop.lng, firstStop.lat]
          const bearing = computeBearing(from, to)
          // Center 30/70-gewichtet Richtung erster Stop — Kamera „beschleunigt" optisch.
          const center: [number, number] = [
            from[0] * 0.3 + to[0] * 0.7,
            from[1] * 0.3 + to[1] * 0.7,
          ]
          const duration = 1100
          try {
            map.easeTo({
              center,
              zoom: 15,
              pitch: 60,
              bearing,
              duration,
              essential: true,
            })
          } catch { /* noop */ }
          // Resolve etwas nach Animations-Ende, damit der nächste Frame
          // mit Endzustand gerendert wurde, bevor router.push feuert.
          window.setTimeout(resolve, duration + 80)
        }),
    }
    onReady(handle)
  }, [onReady])

  // Active-Stop Highlight
  useEffect(() => {
    stopMarkersRef.current.forEach((m, id) => {
      const el = m.getElement()
      if (id === activeStopId) {
        el.style.transform = `${el.style.transform.replace(/scale\([^)]*\)/, '')} scale(1.5)`
        el.style.zIndex = '10'
        el.style.boxShadow = '0 0 0 4px rgba(13,27,62,0.25), 0 4px 10px rgba(13,27,62,0.45)'
      } else {
        el.style.transform = el.style.transform.replace(/scale\([^)]*\)/, '')
        el.style.zIndex = ''
        el.style.boxShadow = '0 2px 6px rgba(13,27,62,0.35)'
      }
    })
  }, [activeStopId])

  if (tokenMissing) {
    return (
      <div
        className="flex items-center justify-center bg-white border border-claimondo-border rounded-xl"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        <div className="text-center px-6">
          <p className="text-sm font-semibold text-claimondo-navy mb-2">Mapbox-Token fehlt</p>
          <p className="text-xs text-claimondo-ondo">NEXT_PUBLIC_MAPBOX_TOKEN setzen.</p>
        </div>
      </div>
    )
  }

  // 2026-05-06: Map ohne Wrapper-Border/Bg — nackte Map-Fläche, RouteStats
  // schweben als Glass-Pill oben. containerRef direkt auf das gestylte
  // Element. Outer mit h-full damit 100%-Strings vom parent korrekt
  // resolven (für Desktop fixed-fill-Setup).
  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
      {routeStats && (
        <div className="absolute top-3 left-3 bg-white/55 backdrop-blur-md border border-white/40 rounded-xl px-3 py-2 shadow-ios-md flex items-center gap-3 text-xs z-10">
          <NavigationIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
          <span className="font-semibold text-claimondo-navy">{routeStats.distanzKm.toFixed(1)} km</span>
          <span className="text-claimondo-ondo">·</span>
          <span className="font-semibold text-claimondo-navy">
            {Math.floor(routeStats.dauerMin / 60) > 0 ? `${Math.floor(routeStats.dauerMin / 60)}h ` : ''}
            {routeStats.dauerMin % 60} min
          </span>
          <span className="text-claimondo-ondo">·</span>
          <span className="text-claimondo-ondo">
            {aktivStops.length} {aktivStops.length === 1 ? 'Stop' : 'Stops'}
          </span>
        </div>
      )}
    </div>
  )
}
