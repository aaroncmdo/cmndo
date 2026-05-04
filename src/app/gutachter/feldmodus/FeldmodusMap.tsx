'use client'

// AAR-382: Mapbox-Karte für den Fokus-Modus.
// 3D Standard-Style mit Pitch 60, SV-Avatar-Marker (live-tracking), Stop-Pins
// (aktueller Stop hervorgehoben), optional Route-Polyline zwischen SV und
// aktuellem Stop (Luftlinie als MVP — HERE-Routing-Integration folgt).
//
// Fehlerbehandlung: Wenn NEXT_PUBLIC_MAPBOX_TOKEN fehlt, wird ein Fallback-
// Platzhalter gerendert. Die Komponente crasht nie.

import { useEffect, useRef } from 'react'
import {
  ensureMapboxInitialized,
  mapboxgl,
  addSvAvatarMarker,
  addKundeMarker,
  upsertRouteLayer,
  MAPBOX_STYLE_STANDARD,
  DEFAULT_FIELD_MAP_CONFIG,
} from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import type { FeldmodusStop, FeldmodusSV } from './page'

export interface FeldmodusMapProps {
  sv: FeldmodusSV
  stops: FeldmodusStop[]
  aktuellerStopIndex: number
  svPosition: { lat: number; lng: number; heading: number | null } | null
}

export default function FeldmodusMap({
  sv,
  stops,
  aktuellerStopIndex,
  svPosition,
}: FeldmodusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const svMarkerRef = useRef<Marker | null>(null)
  const stopMarkersRef = useRef<Marker[]>([])
  const tokenMissing = useRef(false)

  const aktuellerStop = stops[aktuellerStopIndex] ?? null

  // Map-Init einmalig
  useEffect(() => {
    if (!containerRef.current) return
    if (!ensureMapboxInitialized()) {
      tokenMissing.current = true
      return
    }

    // Fallback-Center: SV-Home-Basis oder erster Stop mit Koordinaten
    const fallbackCenter: [number, number] = (() => {
      if (sv.standort_lng != null && sv.standort_lat != null) {
        return [sv.standort_lng, sv.standort_lat]
      }
      const firstWithCoords = stops.find((s) => s.lat != null && s.lng != null)
      if (firstWithCoords && firstWithCoords.lng != null && firstWithCoords.lat != null) {
        return [firstWithCoords.lng, firstWithCoords.lat]
      }
      return [10.4515, 51.1657] // Deutschland-Zentrum
    })()

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_STANDARD,
      center: fallbackCenter,
      zoom: DEFAULT_FIELD_MAP_CONFIG.initialZoom,
      pitch: DEFAULT_FIELD_MAP_CONFIG.pitch,
      bearing: DEFAULT_FIELD_MAP_CONFIG.bearing,
      attributionControl: false,
    })

    mapRef.current = map

    map.on('load', () => {
      // Stop-Pins setzen (Nummer im Marker als Initials verwendet)
      stops.forEach((stop, idx) => {
        if (stop.lat == null || stop.lng == null) return
        const marker = addKundeMarker(map, [stop.lng, stop.lat], {
          initials: String(idx + 1),
        })
        stopMarkersRef.current.push(marker)
      })
      // Initial-fit auf alle Stops sobald Style geladen ist — verhindert,
      // dass die Map auf dem Default-Center stehen bleibt wenn der Container
      // bei der Init noch keine finale Höhe hatte.
      const stopsWithCoords = stops.filter((s) => s.lat != null && s.lng != null)
      if (stopsWithCoords.length > 0) {
        const bounds = new mapboxgl.LngLatBounds()
        stopsWithCoords.forEach((s) => bounds.extend([s.lng as number, s.lat as number]))
        if (sv.standort_lng != null && sv.standort_lat != null) {
          bounds.extend([sv.standort_lng, sv.standort_lat])
        }
        map.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 14 })
      }
    })

    // ResizeObserver: Mapbox rendert sich winzig wenn der Container beim
    // Mount 0×0 ist (typisch bei flex-Layouts). map.resize() bei jeder
    // Container-Größenänderung triggert ein neues Canvas-Sizing.
    const ro = new ResizeObserver(() => {
      try { map.resize() } catch { /* map noch nicht initialisiert */ }
    })
    ro.observe(containerRef.current)

    // Auch beim Window-Resize neu rechnen (Mobile-Browser-URL-Bar Toggle).
    const onWindowResize = () => {
      try { map.resize() } catch { /* noop */ }
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWindowResize)
      svMarkerRef.current?.remove()
      svMarkerRef.current = null
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current = []
      map.remove()
      mapRef.current = null
    }
    // Stops bewusst nur beim Mount ausgewertet — Re-render würde Marker
    // dupliziert anlegen. Bei dynamischen Stops müsste ein Update-Effect rein.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SV-Marker aktualisieren wenn svPosition sich ändert
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!svPosition) return

    if (!svMarkerRef.current) {
      svMarkerRef.current = addSvAvatarMarker(
        map,
        [svPosition.lng, svPosition.lat],
        {
          avatarUrl: sv.avatar_url,
          initials: sv.anzeigename,
          heading: svPosition.heading,
        },
      )
    } else {
      svMarkerRef.current.setLngLat([svPosition.lng, svPosition.lat])
    }
  }, [svPosition, sv.avatar_url, sv.anzeigename])

  // Kamera auf aktuellen Stop + SV zentrieren (wenn beide vorhanden)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !aktuellerStop) return
    if (aktuellerStop.lat == null || aktuellerStop.lng == null) return

    if (svPosition) {
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([svPosition.lng, svPosition.lat])
      bounds.extend([aktuellerStop.lng, aktuellerStop.lat])
      map.fitBounds(bounds, { padding: 80, duration: 700, maxZoom: 15 })
    } else {
      map.easeTo({
        center: [aktuellerStop.lng, aktuellerStop.lat],
        zoom: 14,
        duration: 700,
      })
    }
  }, [aktuellerStop, svPosition])

  // Route-Polyline: Luftlinie zwischen SV und aktuellem Stop
  useEffect(() => {
    const map = mapRef.current
    if (!map || !aktuellerStop) return
    if (!svPosition) return
    if (aktuellerStop.lat == null || aktuellerStop.lng == null) return
    const stopLng = aktuellerStop.lng
    const stopLat = aktuellerStop.lat
    const svLng = svPosition.lng
    const svLat = svPosition.lat
    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        upsertRouteLayer(map, [
          [svLng, svLat],
          [stopLng, stopLat],
        ])
      })
      return
    }
    upsertRouteLayer(map, [
      [svLng, svLat],
      [stopLng, stopLat],
    ])
  }, [svPosition, aktuellerStop])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {tokenMissing.current && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--brand-primary)] text-center px-6">
          <div>
            <p className="text-sm font-semibold mb-2">
              Mapbox-Token fehlt
            </p>
            <p className="text-xs text-claimondo-ondo/50 max-w-xs">
              Die Karte kann nicht geladen werden. Bitte
              NEXT_PUBLIC_MAPBOX_TOKEN in der Umgebung setzen.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
