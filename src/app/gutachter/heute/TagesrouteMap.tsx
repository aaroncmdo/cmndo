'use client'

// SV-Tagesroute-Karte: Mapbox mit Multi-Stop-Route durch alle Termine.
// Zentrale Komponente — keine Einbettung mehr in seitliche Sidebar.
// Stops sind nach Termin-Zeit sortiert, nummeriert (1,2,3,…) und mit echter
// Directions-Route verbunden (nicht Luftlinie).

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ensureMapboxInitialized,
  mapboxgl,
  addSvAvatarMarker,
  addKundeMarker,
  upsertRouteLayer,
  MAPBOX_STYLE_STREETS,
} from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import { NavigationIcon } from 'lucide-react'

export type TagesrouteStop = {
  id: string
  startIso: string
  lat: number
  lng: number
  label: string
}

export type TagesrouteMapProps = {
  svOrigin: { lat: number; lng: number } | null
  stops: TagesrouteStop[]
  /** ID des selektierten Stops — wird visuell hervorgehoben */
  activeStopId?: string | null
  onStopClick?: (stopId: string) => void
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

/**
 * Holt eine echte Mapbox-Directions-Route durch alle Waypoints.
 * Returns: GeoJSON-LineString-Koordinaten + Gesamtdistanz/Dauer.
 * fail-open: bei Fehler null.
 */
async function fetchMultiStopRoute(
  origin: { lat: number; lng: number },
  stops: TagesrouteStop[],
): Promise<{ coords: Array<[number, number]>; distanzKm: number; dauerMin: number } | null> {
  if (!MAPBOX_TOKEN || stops.length === 0) return null
  // Mapbox Directions erlaubt bis zu 25 waypoints
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
}: TagesrouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const svMarkerRef = useRef<Marker | null>(null)
  const stopMarkersRef = useRef<Map<string, Marker>>(new Map())
  const [tokenMissing, setTokenMissing] = useState(false)
  const [routeStats, setRouteStats] = useState<{ distanzKm: number; dauerMin: number } | null>(null)

  // Memoize Stops mit gültigen Koordinaten für stabile Effekt-Deps
  const validStops = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null), [stops])

  // Map-Init einmalig
  useEffect(() => {
    if (!containerRef.current) return
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
      container: containerRef.current,
      style: MAPBOX_STYLE_STREETS,
      center: fallbackCenter,
      zoom: 10,
      pitch: 0,
      attributionControl: false,
    })

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }),
      'top-right',
    )

    mapRef.current = map

    return () => {
      svMarkerRef.current?.remove()
      svMarkerRef.current = null
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SV-Marker setzen + aktualisieren
  useEffect(() => {
    const map = mapRef.current
    if (!map || !svOrigin) return
    const place = () => {
      if (!svMarkerRef.current) {
        svMarkerRef.current = addSvAvatarMarker(map, [svOrigin.lng, svOrigin.lat], { initials: 'Sie', heading: null })
      } else {
        svMarkerRef.current.setLngLat([svOrigin.lng, svOrigin.lat])
      }
    }
    if (map.isStyleLoaded()) place()
    else map.once('load', place)
  }, [svOrigin])

  // Stop-Marker setzen (mit Nummer) + Klick-Handler
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const place = () => {
      // alte Marker entfernen
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current.clear()

      validStops.forEach((stop, idx) => {
        const m = addKundeMarker(map, [stop.lng, stop.lat], { initials: String(idx + 1) })
        // Klick auf Marker-Element via DOM
        const el = m.getElement()
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => onStopClick?.(stop.id))
        stopMarkersRef.current.set(stop.id, m)
      })
    }
    if (map.isStyleLoaded()) place()
    else map.once('load', place)
  }, [validStops, onStopClick])

  // Route-Polyline + fitBounds
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!svOrigin || validStops.length === 0) {
      setRouteStats(null)
      return
    }
    let cancelled = false

    fetchMultiStopRoute(svOrigin, validStops).then((route) => {
      if (cancelled || !mapRef.current) return
      const draw = () => {
        const m = mapRef.current
        if (!m) return
        if (route && route.coords.length > 1) {
          upsertRouteLayer(m, route.coords)
          setRouteStats({ distanzKm: route.distanzKm, dauerMin: route.dauerMin })
        } else {
          // Fallback: Luftlinien-Polyline
          upsertRouteLayer(m, [
            [svOrigin.lng, svOrigin.lat],
            ...validStops.map<[number, number]>((s) => [s.lng, s.lat]),
          ])
          setRouteStats(null)
        }
        // fitBounds auf alle Punkte
        const bounds = new mapboxgl.LngLatBounds()
        bounds.extend([svOrigin.lng, svOrigin.lat])
        validStops.forEach((s) => bounds.extend([s.lng, s.lat]))
        m.fitBounds(bounds, { padding: 80, duration: 500, maxZoom: 14 })
      }
      if (mapRef.current.isStyleLoaded()) draw()
      else mapRef.current.once('load', draw)
    })

    return () => {
      cancelled = true
    }
  }, [svOrigin, validStops])

  // Active-Stop highlighten via DOM-Klasse
  useEffect(() => {
    stopMarkersRef.current.forEach((m, id) => {
      const el = m.getElement()
      if (id === activeStopId) {
        el.style.transform = `${el.style.transform.replace(/scale\([^)]*\)/, '')} scale(1.25)`
        el.style.zIndex = '10'
      } else {
        el.style.transform = el.style.transform.replace(/scale\([^)]*\)/, '')
        el.style.zIndex = ''
      }
    })
  }, [activeStopId])

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-claimondo-border bg-[#f8f9fb]">
      <div ref={containerRef} className="absolute inset-0" />
      {tokenMissing && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/95 text-center px-6 z-10">
          <div>
            <p className="text-sm font-semibold text-claimondo-navy mb-2">Mapbox-Token fehlt</p>
            <p className="text-xs text-claimondo-ondo">NEXT_PUBLIC_MAPBOX_TOKEN setzen.</p>
          </div>
        </div>
      )}
      {routeStats && (
        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm border border-claimondo-border rounded-xl px-3 py-2 shadow-sm flex items-center gap-3 text-xs">
          <NavigationIcon className="w-3.5 h-3.5 text-claimondo-ondo" />
          <span className="font-semibold text-claimondo-navy">{routeStats.distanzKm.toFixed(1)} km</span>
          <span className="text-claimondo-ondo">·</span>
          <span className="font-semibold text-claimondo-navy">
            {Math.floor(routeStats.dauerMin / 60) > 0 ? `${Math.floor(routeStats.dauerMin / 60)}h ` : ''}
            {routeStats.dauerMin % 60} min
          </span>
          <span className="text-claimondo-ondo">·</span>
          <span className="text-claimondo-ondo">
            {validStops.length} {validStops.length === 1 ? 'Stop' : 'Stops'}
          </span>
        </div>
      )}
    </div>
  )
}
