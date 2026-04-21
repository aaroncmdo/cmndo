'use client'

// AAR-387: Mapbox-Vogelperspektive-Karte für die Kunden-Live-Ansicht.
// Drei Marker (Ziel, SV, Kunde) + zwei Routen (Luftlinien-Fallback wenn
// keine gespeicherte Polyline existiert). fitBounds hält alle aktiven
// Marker im Sichtfeld; User-Pan pausiert Auto-Fit für 30 Sekunden.
//
// Bewusst minimalistisch: Routen werden inline als geojson-Layer
// gerendert (statt via shared route-layer), weil sv vs. kunde
// unterschiedliche Farben brauchen und Luftlinien-Fallback je Partei
// separat nötig ist.

import { useEffect, useRef } from 'react'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import {
  ensureMapboxInitialized,
  mapboxgl,
  MAPBOX_STYLE_STANDARD,
  addSvAvatarMarker,
} from '@/lib/mapbox'

interface Position {
  lat: number
  lng: number
}

interface Props {
  zielLat: number
  zielLng: number
  zielLabel: string
  svPosition: Position | null
  svVorname: string
  svAvatarUrl: string | null
  kundePosition: Position | null
  /** Gespeicherte Polyline [[lng,lat], …] — wenn null wird Luftlinie genutzt. */
  svRoutePolyline?: Array<[number, number]> | null
  kundeRoutePolyline?: Array<[number, number]> | null
  className?: string
}

const AUTO_FIT_INTERVAL_MS = 10_000
const USER_PAN_PAUSE_MS = 30_000

export default function KundeLiveMap({
  zielLat,
  zielLng,
  zielLabel,
  svPosition,
  svVorname,
  svAvatarUrl,
  kundePosition,
  svRoutePolyline,
  kundeRoutePolyline,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const zielMarkerRef = useRef<MapboxMarker | null>(null)
  const svMarkerRef = useRef<MapboxMarker | null>(null)
  const kundeMarkerRef = useRef<MapboxMarker | null>(null)
  const lastUserInteractionRef = useRef<number>(0)
  const autoFitTimerRef = useRef<number | null>(null)

  // Karte initialisieren (nur einmal beim Mount)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!ensureMapboxInitialized()) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_STANDARD,
      center: [zielLng, zielLat],
      zoom: 12,
      pitch: 0,
      bearing: 0,
      attributionControl: true,
    })
    mapRef.current = map

    // User-Interaktion signalisiert dass Auto-Fit pausieren soll
    const onUserInteract = () => {
      lastUserInteractionRef.current = Date.now()
    }
    map.on('dragstart', onUserInteract)
    map.on('zoomstart', onUserInteract)

    map.on('load', () => {
      // Ziel-Marker aufsetzen (fix, prominenter Pin)
      const zielEl = document.createElement('div')
      zielEl.style.cssText = [
        'position: relative',
        'width: 44px',
        'height: 56px',
        'pointer-events: none',
      ].join(';')
      zielEl.innerHTML = `
        <div style="
          position: absolute; top: 0; left: 0; right: 0; bottom: 12px;
          background: #0D1B3E; border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg); border: 3px solid #FFFFFF;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
        ">
          <div style="
            transform: rotate(45deg); color: white; font-weight: 700;
            font-size: 16px;
          ">🎯</div>
        </div>
      `
      zielMarkerRef.current = new mapboxgl.Marker({
        element: zielEl,
        anchor: 'bottom',
      })
        .setLngLat([zielLng, zielLat])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setText(zielLabel))
        .addTo(map)
    })

    return () => {
      if (autoFitTimerRef.current) window.clearInterval(autoFitTimerRef.current)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // SV-Marker aktualisieren / erstellen
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!svPosition) {
        if (svMarkerRef.current) {
          svMarkerRef.current.remove()
          svMarkerRef.current = null
        }
        return
      }
      if (svMarkerRef.current) {
        svMarkerRef.current.setLngLat([svPosition.lng, svPosition.lat])
      } else {
        svMarkerRef.current = addSvAvatarMarker(
          map,
          [svPosition.lng, svPosition.lat],
          {
            avatarUrl: svAvatarUrl,
            initials: svVorname.slice(0, 2),
          },
        )
      }
    }
    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [svPosition, svAvatarUrl, svVorname])

  // Kunde-Marker (grüner Kreis "Sie")
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!kundePosition) {
        if (kundeMarkerRef.current) {
          kundeMarkerRef.current.remove()
          kundeMarkerRef.current = null
        }
        return
      }
      if (kundeMarkerRef.current) {
        kundeMarkerRef.current.setLngLat([kundePosition.lng, kundePosition.lat])
      } else {
        const el = document.createElement('div')
        el.style.cssText = [
          'width: 36px',
          'height: 36px',
          'border-radius: 9999px',
          'background: #10b981',
          'border: 3px solid #FFFFFF',
          'box-shadow: 0 4px 10px rgba(0,0,0,0.3)',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'color: #FFFFFF',
          'font-weight: 700',
          'font-size: 12px',
          'pointer-events: none',
          'transition: transform 1.5s ease-out',
        ].join(';')
        el.textContent = 'Sie'
        kundeMarkerRef.current = new mapboxgl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat([kundePosition.lng, kundePosition.lat])
          .addTo(map)
      }
    }
    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [kundePosition])

  // SV-Route (navy)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const coords: Array<[number, number]> =
      svRoutePolyline && svRoutePolyline.length > 0
        ? svRoutePolyline
        : svPosition
          ? [
              [svPosition.lng, svPosition.lat],
              [zielLng, zielLat],
            ]
          : []
    const apply = () => upsertCustomRouteLayer(map, 'sv-route', coords, '#4573A2')
    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [svRoutePolyline, svPosition, zielLat, zielLng])

  // Kunde-Route (emerald)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const coords: Array<[number, number]> =
      kundeRoutePolyline && kundeRoutePolyline.length > 0
        ? kundeRoutePolyline
        : kundePosition
          ? [
              [kundePosition.lng, kundePosition.lat],
              [zielLng, zielLat],
            ]
          : []
    const apply = () =>
      upsertCustomRouteLayer(map, 'kunde-route', coords, '#10b981')
    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [kundeRoutePolyline, kundePosition, zielLat, zielLng])

  // Auto-fit-Bounds alle 10s wenn User nicht aktiv interagiert
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const fit = () => {
      const sinceInteract = Date.now() - lastUserInteractionRef.current
      if (sinceInteract < USER_PAN_PAUSE_MS) return
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([zielLng, zielLat])
      if (svPosition) bounds.extend([svPosition.lng, svPosition.lat])
      if (kundePosition) bounds.extend([kundePosition.lng, kundePosition.lat])
      try {
        map.fitBounds(bounds, { padding: 80, duration: 800, essential: true })
      } catch {}
    }
    // Initial fit nach load
    const runOnceLoaded = () => {
      if (map.loaded()) fit()
      else map.once('load', fit)
    }
    runOnceLoaded()
    autoFitTimerRef.current = window.setInterval(fit, AUTO_FIT_INTERVAL_MS)
    return () => {
      if (autoFitTimerRef.current) window.clearInterval(autoFitTimerRef.current)
    }
  }, [svPosition, kundePosition, zielLat, zielLng])

  return (
    <div
      ref={containerRef}
      className={className ?? 'w-full h-full'}
      style={{ minHeight: 300 }}
    />
  )
}

// --- Hilfs-Funktionen ------------------------------------------------

function upsertCustomRouteLayer(
  map: MapboxMap,
  id: string,
  coords: Array<[number, number]>,
  color: string,
) {
  const sourceId = `${id}-source`
  const lineLayerId = `${id}-line`
  const glowLayerId = `${id}-glow`

  if (coords.length < 2) {
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId)
    if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }

  const feature: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords },
  }
  const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
  if (source) {
    source.setData(feature)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data: feature })
  map.addLayer({
    id: glowLayerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': color,
      'line-width': 14,
      'line-opacity': 0.25,
      'line-blur': 4,
    },
  })
  map.addLayer({
    id: lineLayerId,
    type: 'line',
    source: sourceId,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': color,
      'line-width': 5,
    },
  })
}
