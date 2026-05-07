'use client'

// AAR-382: Mapbox-Karte für den Fokus-Modus.
// 3D Standard-Style mit Pitch 60, SV-Avatar-Marker (live-tracking), Stop-Pins
// (aktueller Stop hervorgehoben), optional Route-Polyline zwischen SV und
// aktuellem Stop (Luftlinie als MVP — HERE-Routing-Integration folgt).
//
// Fehlerbehandlung: Wenn NEXT_PUBLIC_MAPBOX_TOKEN fehlt, wird ein Fallback-
// Platzhalter gerendert. Die Komponente crasht nie.

import { useEffect, useRef, useState } from 'react'
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
  attachGoogle3dTiles,
  isGoogle3dTilesEnabled,
  type Google3dTilesHandle,
  attachCesium3dTiles,
  isCesium3dTilesEnabled,
  type Cesium3dTilesHandle,
} from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import type { FeldmodusStop, FeldmodusSV } from './page'
import type { MapboxLightPreset } from '@/lib/mapbox/light-preset'

type FogSpec = {
  color: string
  'high-color': string
  'horizon-blend': number
  'space-color': string
  'star-intensity': number
}

/**
 * Phase-3-Atmosphäre. Liefert Fog-Spec passend zur Tageszeit.
 */
function fogForLightPreset(preset: MapboxLightPreset): FogSpec {
  switch (preset) {
    case 'dawn':
      return { color: 'rgb(255, 220, 200)', 'high-color': 'rgb(255, 195, 165)', 'horizon-blend': 0.08, 'space-color': 'rgb(60, 30, 70)', 'star-intensity': 0.05 }
    case 'dusk':
      return { color: 'rgb(245, 195, 195)', 'high-color': 'rgb(180, 140, 175)', 'horizon-blend': 0.08, 'space-color': 'rgb(40, 20, 70)', 'star-intensity': 0.1 }
    case 'night':
      return { color: 'rgb(60, 80, 120)', 'high-color': 'rgb(40, 60, 100)', 'horizon-blend': 0.04, 'space-color': 'rgb(5, 8, 25)', 'star-intensity': 0.55 }
    default:
      return { color: 'rgb(220, 230, 240)', 'high-color': 'rgb(200, 210, 230)', 'horizon-blend': 0.05, 'space-color': 'rgb(13, 27, 62)', 'star-intensity': 0.05 }
  }
}

/**
 * Phase-3b-Wetter-Modifier. Verändert die Tageszeit-Fog-Spec basierend auf
 * OpenWeatherMap weather_id. Visuelle Effekte:
 *   - Gewitter (2xx): dichter Fog, dunkler Cast
 *   - Drizzle/Regen (3xx, 5xx): grauer dichter Fog
 *   - Schnee (6xx): heller Blauschimmer
 *   - Nebel/Dunst (7xx): MAX horizon-blend, fast-weiß
 *   - Bewölkt (80x mit x>0): subtler Grau-Tint
 *   - Klar (800): unverändert
 */
function applyWeatherToFog(base: FogSpec, weatherId: number | null): FogSpec {
  if (weatherId == null) return base
  if (weatherId >= 200 && weatherId < 300) {
    // Gewitter
    return { ...base, color: 'rgb(110, 120, 140)', 'high-color': 'rgb(70, 80, 100)', 'horizon-blend': 0.16, 'space-color': 'rgb(15, 20, 35)' }
  }
  if (weatherId >= 300 && weatherId < 600) {
    // Drizzle + Regen
    return { ...base, color: 'rgb(180, 190, 200)', 'high-color': 'rgb(140, 150, 170)', 'horizon-blend': 0.12 }
  }
  if (weatherId >= 600 && weatherId < 700) {
    // Schnee
    return { ...base, color: 'rgb(225, 235, 245)', 'high-color': 'rgb(200, 215, 235)', 'horizon-blend': 0.10 }
  }
  if (weatherId >= 700 && weatherId < 800) {
    // Nebel/Dunst — fast komplett verschwommen
    return { ...base, color: 'rgb(220, 220, 220)', 'high-color': 'rgb(200, 200, 200)', 'horizon-blend': 0.25, 'space-color': 'rgb(150, 150, 160)' }
  }
  if (weatherId > 800 && weatherId < 900) {
    // Bewölkt — leichter Grau-Tint
    return { ...base, color: 'rgb(200, 210, 220)', 'high-color': 'rgb(170, 180, 200)' }
  }
  // 800: Klar
  return base
}

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
  const google3dTilesRef = useRef<Google3dTilesHandle | null>(null)
  const cesium3dTilesRef = useRef<Cesium3dTilesHandle | null>(null)
  const stopMarkersRef = useRef<Marker[]>([])
  const tokenMissing = useRef(false)
  // 2026-05-07 Phase 3b: Wetter-Code (OpenWeatherMap weather_id) am
  // aktuellen Stop. Modifiziert Fog-Tinting (dichter bei Regen, hellgrau
  // bei Schnee, fast-blind bei Nebel).
  const [weatherId, setWeatherId] = useState<number | null>(null)

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
    //
    // 2026-05-07 (Phase 3): Light-Preset folgt der TERMIN-ZEIT statt der
    // Wall-Clock-Zeit. Wenn SV um 13 Uhr zum 18-Uhr-Termin fährt, sieht er
    // bereits dusk-Licht — fühlt sich wie eine Vorschau auf die Anfahrt an
    // und matcht den Stimmungs-Kontext. Bei fehlendem Stop fällt es auf
    // jetzt zurück.
    const applyLightPreset = () => {
      const targetStop = stops[Math.max(0, aktuellerStopIndex)] ?? null
      const lightAt = targetStop?.start_zeit ? new Date(targetStop.start_zeit) : new Date()
      try {
        map.setConfigProperty('basemap', 'lightPreset', getMapboxLightPreset(lightAt))
        map.setConfigProperty('basemap', 'show3dObjects', true)
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false)
        map.setConfigProperty('basemap', 'showRoadLabels', true)
        map.setConfigProperty('basemap', 'showTransitLabels', false)
      } catch { /* fail silent */ }
    }
    const applyAtmosphere = () => {
      // 2026-05-07 Phase 3 + 3b: Fog-Tinting folgt Termin-Light-Preset
      // (Tageszeit) UND Wetter-Code (Regen/Schnee/Nebel/Bewölkung).
      const targetStop = stops[Math.max(0, aktuellerStopIndex)] ?? null
      const lightAt = targetStop?.start_zeit ? new Date(targetStop.start_zeit) : new Date()
      const preset = getMapboxLightPreset(lightAt)
      const fog = applyWeatherToFog(fogForLightPreset(preset), weatherId)
      try {
        map.setFog(fog as Parameters<typeof map.setFog>[0])
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

      // 2026-05-07 Phase 4: 3D-Tiles — bevorzugt Cesium Ion (in EEA
      // verfügbar), Google als Fallback (in EEA seit 2024 gesperrt).
      // Lazy-Import damit deck.gl + loaders.gl nicht ins initial Bundle
      // gehen wenn beide Features off sind.
      if (isCesium3dTilesEnabled()) {
        attachCesium3dTiles(map).then((handle) => {
          if (handle) cesium3dTilesRef.current = handle
        }).catch((err) => {
          console.error('[FeldmodusMap] cesium-3d-tiles attach failed:', err)
        })
      } else if (isGoogle3dTilesEnabled()) {
        attachGoogle3dTiles(map).then((handle) => {
          if (handle) google3dTilesRef.current = handle
        }).catch((err) => {
          console.error('[FeldmodusMap] google-3d-tiles attach failed:', err)
        })
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
      google3dTilesRef.current?.remove()
      google3dTilesRef.current = null
      cesium3dTilesRef.current?.remove()
      cesium3dTilesRef.current = null
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

  // 2026-05-07 Phase 3b: Wetter-Fetch beim Stop-Wechsel. Cached über den
  // /api/weather-Endpoint (5-min TTL).
  useEffect(() => {
    const target = stops[aktuellerStopIndex]
    if (!target?.lat || !target?.lng) return
    const ctrl = new AbortController()
    fetch(`/api/weather?lat=${target.lat}&lng=${target.lng}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.weather_id === 'number') setWeatherId(data.weather_id)
      })
      .catch(() => { /* abort or offline — Fog bleibt clear */ })
    return () => ctrl.abort()
  }, [aktuellerStopIndex, stops])

  // 2026-05-07 Phase 3 + 5: Light-Preset + Fog-Tinting folgen der Termin-
  // Zeit. Bei Stop-Wechsel werden Beleuchtung UND atmosphärische Töne sanft
  // umgestellt — Mapbox Standard interpoliert die Übergänge selbständig.
  // Phase 5: Hero-Pin-Sun-Direction folgt dem gleichen Preset → Schatten
  // wirken konsistent.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const target = stops[aktuellerStopIndex]
    if (!target?.start_zeit) return
    const preset = getMapboxLightPreset(new Date(target.start_zeit))
    try {
      map.setConfigProperty('basemap', 'lightPreset', preset)
      const fog = applyWeatherToFog(fogForLightPreset(preset), weatherId)
      map.setFog(fog as Parameters<typeof map.setFog>[0])
      heroPinRef.current?.updateLight(preset)
    } catch { /* style not ready yet */ }
  }, [aktuellerStopIndex, stops, weatherId])

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
    <div className="relative" style={{ width: '100%', height: '100%', minHeight: '100%' }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
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
