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
  addSvCarMarker,
  addKundeMarker,
  upsertRouteLayer,
  MAPBOX_STYLE_STANDARD,
  DEFAULT_FIELD_MAP_CONFIG,
  getMapboxLightPreset,
  tryAddSvCar3dModel,
  type SvCar3dHandle,
  attachHeroPin3d,
  type HeroPin3dHandle,
} from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import type { FeldmodusStop, FeldmodusSV } from './page'

export interface FeldmodusMapProps {
  sv: FeldmodusSV
  stops: FeldmodusStop[]
  aktuellerStopIndex: number
  svPosition: { lat: number; lng: number; heading: number | null } | null
  /** Wenn true → Map folgt SV-Position mit bearing=heading + close zoom (TbT). */
  followSv?: boolean
}

export default function FeldmodusMap({
  sv,
  stops,
  aktuellerStopIndex,
  svPosition,
  followSv = false,
}: FeldmodusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const svMarkerRef = useRef<Marker | null>(null)
  const sv3dHandleRef = useRef<SvCar3dHandle | null>(null)
  const heroPinRef = useRef<HeroPin3dHandle | null>(null)
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

    // 2026-05-07 (Phase 1 hyperrealistic-roadmap): Light-Preset + 3D-Modelle
    // + Atmosphäre. Fog erzeugt Horizon-Tiefe; Terrain liefert globale
    // Höhendaten für hügelige Anfahrten; POI-Labels aus für aufgeräumten
    // Fokus, Road-Labels an für Orientierung. Alles GPU-beschleunigt,
    // 0 zusätzliche Performance-Kosten. Siehe
    // docs/integrations/feldmodus-mapbox-3d-roadmap.md
    const applyLightPreset = () => {
      try {
        map.setConfigProperty('basemap', 'lightPreset', getMapboxLightPreset())
        map.setConfigProperty('basemap', 'show3dObjects', true)
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false)
        map.setConfigProperty('basemap', 'showRoadLabels', true)
        map.setConfigProperty('basemap', 'showTransitLabels', false)
      } catch { /* fail silent */ }
    }
    const applyAtmosphere = () => {
      try {
        // Fog mit claimondo-Navy-Space-Color für Horizon-Tiefe.
        map.setFog({
          color: 'rgb(220, 230, 240)',
          'high-color': 'rgb(200, 210, 230)',
          'horizon-blend': 0.05,
          'space-color': 'rgb(13, 27, 62)', // #0D1B3E claimondo-navy
          'star-intensity': 0.15,
        })
        // Terrain: globale Höhendaten für plastische Berge/Täler.
        // Die mapbox-dem-Source ist im Standard-Style bereits enthalten;
        // wir aktivieren sie nur als Terrain-Layer.
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          })
        }
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 })
      } catch { /* fail silent */ }
    }
    map.on('style.load', applyLightPreset)
    map.on('style.load', applyAtmosphere)
    const presetTick = setInterval(applyLightPreset, 5 * 60_000)

    map.on('load', () => {
      // 2026-05-07: Versuche das 3D-Auto-Modell zu laden. Initialer Pose
      // = SV-Home-Standort (Heading unbekannt → 0). Wenn der Load fehl-
      // schlaegt (kein glb hinterlegt, 404, korrupt), bleibt
      // sv3dHandleRef.current null → der bestehende 2D-SVG-Marker
      // uebernimmt nahtlos.
      const initialPose: [number, number] = (() => {
        if (sv.standort_lng != null && sv.standort_lat != null) {
          return [sv.standort_lng, sv.standort_lat]
        }
        const firstStop = stops.find((s) => s.lat != null && s.lng != null)
        if (firstStop && firstStop.lng != null && firstStop.lat != null) {
          return [firstStop.lng, firstStop.lat]
        }
        return [10.4515, 51.1657]
      })()
      tryAddSvCar3dModel(map, { lngLat: initialPose, heading: 0 })
        .then((handle) => {
          if (!handle) return
          sv3dHandleRef.current = handle
          // 3D ist da — falls bereits ein 2D-Fallback-Marker entstanden
          // ist, entfernen.
          if (svMarkerRef.current) {
            svMarkerRef.current.remove()
            svMarkerRef.current = null
          }
        })
        .catch(() => { /* fail silent — 2D-Fallback bleibt aktiv */ })

      // Stop-Pins setzen (Nummer im Marker als Initials verwendet)
      stops.forEach((stop, idx) => {
        if (stop.lat == null || stop.lng == null) return
        const marker = addKundeMarker(map, [stop.lng, stop.lat], {
          initials: String(idx + 1),
        })
        stopMarkersRef.current.push(marker)
      })

      // 2026-05-07 Phase 2: Hero-Pin 3D-Glow am aktuellen Ziel.
      // Schwebt 25 m über dem Stop, pulsiert in claimondo-light-blue.
      const heroStop = stops[Math.max(0, aktuellerStopIndex)] ?? null
      if (heroStop && heroStop.lat != null && heroStop.lng != null) {
        try {
          heroPinRef.current = attachHeroPin3d(map, [heroStop.lng, heroStop.lat])
        } catch (err) {
          console.error('[FeldmodusMap] hero-pin attach failed:', err)
        }
      }
      // Initial-Camera: nahtlose Fortsetzung der Heute→Feldmodus-Intro-
      // Animation. Pitch 60 + enger Zoom + Bearing Richtung erstem Stop —
      // KEIN Wide-Bounds-Fit (würde den Pitch auf 0 reseten und das
      // Driving-Gefühl zerstören). Gibt es keinen Stop mit Koordinaten,
      // bleibt die Map auf dem fallbackCenter.
      const startStop =
        stops[Math.max(0, aktuellerStopIndex)] ??
        stops.find((s) => s.lat != null && s.lng != null) ??
        null
      if (startStop && startStop.lat != null && startStop.lng != null) {
        const stopLng = startStop.lng
        const stopLat = startStop.lat
        let bearing = DEFAULT_FIELD_MAP_CONFIG.bearing
        if (sv.standort_lng != null && sv.standort_lat != null) {
          const φ1 = (sv.standort_lat * Math.PI) / 180
          const φ2 = (stopLat * Math.PI) / 180
          const Δλ = ((stopLng - sv.standort_lng) * Math.PI) / 180
          const y = Math.sin(Δλ) * Math.cos(φ2)
          const x =
            Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
          bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
        }
        map.jumpTo({
          center: [stopLng, stopLat],
          zoom: 15,
          pitch: DEFAULT_FIELD_MAP_CONFIG.pitch,
          bearing,
        })
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
      clearInterval(presetTick)
      ro.disconnect()
      window.removeEventListener('resize', onWindowResize)
      svMarkerRef.current?.remove()
      svMarkerRef.current = null
      sv3dHandleRef.current?.remove()
      sv3dHandleRef.current = null
      heroPinRef.current?.remove()
      heroPinRef.current = null
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current = []
      map.remove()
      mapRef.current = null
    }
    // Stops bewusst nur beim Mount ausgewertet — Re-render würde Marker
    // dupliziert anlegen. Bei dynamischen Stops müsste ein Update-Effect rein.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2026-05-07 Phase 2: Hero-Pin folgt dem aktuellen Ziel-Stop. Wenn der
  // SV einen Stop abschließt und der Index weiterspringt, wandert der
  // glühende Pin auf den nächsten Stop.
  useEffect(() => {
    const handle = heroPinRef.current
    if (!handle) return
    const target = stops[aktuellerStopIndex]
    if (!target || target.lat == null || target.lng == null) return
    handle.update([target.lng, target.lat])
  }, [aktuellerStopIndex, stops])

  // SV-Marker aktualisieren wenn svPosition sich ändert.
  // 2026-05-07: 3D-Modell-Pfad bevorzugt — wenn `sv3dHandleRef` da ist,
  // wird die Pose ueber den ModelSource gesetzt (echter 3D-Render mit
  // Mapbox-Schatten). Andernfalls bleibt der 2D-SVG-Marker aktiv.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!svPosition) return

    if (sv3dHandleRef.current) {
      sv3dHandleRef.current.update({
        lngLat: [svPosition.lng, svPosition.lat],
        heading: svPosition.heading,
      })
      return
    }

    if (!svMarkerRef.current) {
      svMarkerRef.current = addSvCarMarker(
        map,
        [svPosition.lng, svPosition.lat],
        { heading: svPosition.heading },
      )
    } else {
      svMarkerRef.current.setLngLat([svPosition.lng, svPosition.lat])
      // Heading live updaten — Auto rotiert mit Fahrtrichtung
      if (svPosition.heading != null) {
        svMarkerRef.current.getElement().style.transform =
          `${svMarkerRef.current.getElement().style.transform.replace(/rotate\([^)]*\)/, '')} rotate(${svPosition.heading}deg)`
      }
    }
  }, [svPosition])

  // Kamera-Follow oder Bounds-Fit
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // TbT-Modus: Map folgt SV mit Heading-Rotation, nahem Zoom, hohem Pitch
    if (followSv && svPosition) {
      map.easeTo({
        center: [svPosition.lng, svPosition.lat],
        zoom: 16.5,
        bearing: svPosition.heading ?? 0,
        pitch: 60,
        duration: 800,
        essential: true,
      })
      return
    }

    // Bounds-Mode: SV + aktueller Stop in den Sichtbereich. Pitch bleibt
    // auf 60 — fitBounds würde sonst auf 0 zurücksetzen und den durch
    // die Heute→Feldmodus-Intro etablierten Driving-Look brechen.
    if (!aktuellerStop) return
    if (aktuellerStop.lat == null || aktuellerStop.lng == null) return
    if (svPosition) {
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([svPosition.lng, svPosition.lat])
      bounds.extend([aktuellerStop.lng, aktuellerStop.lat])
      map.fitBounds(bounds, {
        padding: 80,
        duration: 700,
        maxZoom: 15,
        pitch: DEFAULT_FIELD_MAP_CONFIG.pitch,
      })
    } else {
      map.easeTo({
        center: [aktuellerStop.lng, aktuellerStop.lat],
        zoom: 14,
        pitch: DEFAULT_FIELD_MAP_CONFIG.pitch,
        duration: 700,
      })
    }
  }, [aktuellerStop, svPosition, followSv])

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
