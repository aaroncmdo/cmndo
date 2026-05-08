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
  upsertTrafficRouteLayer,
  fetchDrivingRoute,
  type TrafficRoute,
  MAPBOX_STYLE_STANDARD,
  DEFAULT_FIELD_MAP_CONFIG,
  getMapboxLightPreset,
  tryAddSvCar3dModel,
  type SvCar3dHandle,
  tryAddSvCarThreeJs,
  getSvCarObjUrl,
  type SvCarThreeHandle,
  attachHeroPin3d,
  type HeroPin3dHandle,
  attachGoogle3dTiles,
  isGoogle3dTilesEnabled,
  type Google3dTilesHandle,
  attachCesium3dTiles,
  isCesium3dTilesEnabled,
  type Cesium3dTilesHandle,
  attachBlitzerLayer,
  fetchBlitzerInBbox,
  bboxForRoute,
  type BlitzerLayerHandle,
  type BlitzerFeature,
  attachHazardLayer,
  fetchHereHazards,
  type HazardFeature,
  type HazardLayerHandle,
  attachFlowLayer,
  fetchHereFlow,
  type FlowLayerHandle,
  pickFasterAlternative,
  findHazardOnRoute,
  distanceToHazardM,
  REROUTE_POLL_INTERVAL_MS,
  type ProposedReroute,
} from '@/lib/mapbox'
import type { NaviNotice } from './NaviHud'
import { formatNaviDistance } from './NaviHud'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import { sampleWeatherAlongRoute, clusterWeatherSamples } from '@/lib/mapbox/weather-route'
import { attachWeatherFx, type WeatherFxHandle } from '@/lib/mapbox/weather-fx'
import type { FeldmodusStop, FeldmodusSV } from './page'
import type { MapboxLightPreset } from '@/lib/mapbox/light-preset'
import { haversineMetersLngLat, speakInstruction } from '@/lib/mapbox/turn-by-turn'

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
  /**
   * 2026-05-08 (C6): Hero-Pin wechselt bei `arrived` auf grünen Glow +
   * doppelte Pulse-Frequenz. Wird vom Caller gesetzt sobald die Session
   * den Status 'arrived' erreicht.
   */
  arrived?: boolean
  /**
   * 2026-05-08 (C10): Map meldet ihre internen Notice-Trigger (Blitzer-
   * Anflug, Hazard-on-Route, Reroute-Vorschlag) an den Caller, der sie
   * mit tbt-Maneuver/Lane kombiniert und im NaviHud rendert.
   * null = kein Notice der Map aktuell.
   */
  onMapNotice?: (notice: NaviNotice | null) => void
}

export default function FeldmodusMap({
  sv,
  stops,
  aktuellerStopIndex,
  svPosition,
  followSv = false,
  arrived = false,
  onMapNotice,
}: FeldmodusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const svMarkerRef = useRef<Marker | null>(null)
  const sv3dHandleRef = useRef<SvCar3dHandle | null>(null)
  // 2026-05-08 (C11b): Three.js-OBJ-Variante des Auto-Renderers.
  // Aktiv nur wenn NEXT_PUBLIC_SV_CAR_OBJ_URL gesetzt ist.
  const svThreeHandleRef = useRef<SvCarThreeHandle | null>(null)
  const heroPinRef = useRef<HeroPin3dHandle | null>(null)
  const google3dTilesRef = useRef<Google3dTilesHandle | null>(null)
  const cesium3dTilesRef = useRef<Cesium3dTilesHandle | null>(null)
  const blitzerRef = useRef<BlitzerLayerHandle | null>(null)
  const blitzerFeaturesRef = useRef<BlitzerFeature[]>([])
  const warnedBlitzerIdsRef = useRef<Set<string>>(new Set())
  const hazardsRef = useRef<HazardLayerHandle | null>(null)
  const flowRef = useRef<FlowLayerHandle | null>(null)
  // 2026-05-08 (C12): Wetter-Animations-Layer (Three.js Particles für
  // Schnee/Regen/Sturm an Wetter-Hotspots der Route). Wird beim primary-
  // Route-Update mit-aktualisiert.
  const weatherFxRef = useRef<WeatherFxHandle | null>(null)
  const stopMarkersRef = useRef<Marker[]>([])
  const tokenMissing = useRef(false)
  // 2026-05-07 Phase 3b: Wetter-Code (OpenWeatherMap weather_id) am
  // aktuellen Stop. Modifiziert Fog-Tinting (dichter bei Regen, hellgrau
  // bei Schnee, fast-blind bei Nebel).
  const [weatherId, setWeatherId] = useState<number | null>(null)
  // 2026-05-08 PR B2: Live-Reroute-State.
  // primaryRouteRef speichert die aktuell gerenderte Route für Hazard-on-
  // Route-Detection und Polling-Vergleich. Hazards werden im selben Effect
  // wie die Route geholt und in hazardsDataRef gepuffert.
  const primaryRouteRef = useRef<TrafficRoute | null>(null)
  const hazardsDataRef = useRef<HazardFeature[]>([])
  const [proposedReroute, setProposedReroute] = useState<ProposedReroute | null>(null)
  const proposedHazardSeenIdsRef = useRef<Set<string>>(new Set())
  // 2026-05-08 (C10): Blitzer-Notice für NaviHud — separat vom Voice-
  // Trigger damit das visuelle Banner unabhängig vom Audio-Cooldown
  // updaten kann (Audio fired einmal pro Threshold, Visual zeigt
  // dauerhaft solange Distance < 600 m).
  const [blitzerNotice, setBlitzerNotice] = useState<NaviNotice | null>(null)

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
      // 2026-05-08 (C11b): wenn NEXT_PUBLIC_SV_CAR_OBJ_URL gesetzt ist,
      // bevorzugen wir den Three.js-OBJ-Pfad. Fällt bei Fehler (404,
      // OOM bei zu großem OBJ) auf den Mapbox-glb-Pfad zurück.
      const objUrl = getSvCarObjUrl()
      const onCarReady = () => {
        if (svMarkerRef.current) {
          svMarkerRef.current.remove()
          svMarkerRef.current = null
        }
      }
      if (objUrl) {
        // 2026-05-08: Default-Scale 3.5 weil das Porsche-OBJ im
        // Original-Modellraum auf -0.85 bis 0.85 normalisiert ist
        // (entspricht 1.7 m). Echte Autos sind 4.5 m → Scale 3 macht
        // das Modell ca. 5 m lang. Bei anderen OBJs anpassen.
        tryAddSvCarThreeJs(map, { lngLat: initialPose, heading: 0, scale: 3.5 }, { objUrl })
          .then((handle) => {
            if (handle) {
              svThreeHandleRef.current = handle
              onCarReady()
              return
            }
            // OBJ failed → glb-Fallback versuchen
            return tryAddSvCar3dModel(map, { lngLat: initialPose, heading: 0 }).then((h) => {
              if (h) { sv3dHandleRef.current = h; onCarReady() }
            })
          })
          .catch(() => { /* fail silent — 2D-Fallback bleibt aktiv */ })
      } else {
        tryAddSvCar3dModel(map, { lngLat: initialPose, heading: 0 })
          .then((handle) => {
            if (!handle) return
            sv3dHandleRef.current = handle
            onCarReady()
          })
          .catch(() => { /* fail silent — 2D-Fallback bleibt aktiv */ })
      }

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
      // 2026-05-07 (Aaron-Smoke): Initial-Camera zentriert auf SV, nicht
      // auf den Stop. Vorher dreht die Camera „um den Dom", der SV-Pin
      // war winzig irgendwo am Rand. Jetzt: SV-Position ist Mitte, Bearing
      // zeigt Richtung Stop (so dass beim Vorwärtsfahren der Stop oben ist).
      const startStop =
        stops[Math.max(0, aktuellerStopIndex)] ??
        stops.find((s) => s.lat != null && s.lng != null) ??
        null
      const carCenter: [number, number] | null =
        sv.standort_lng != null && sv.standort_lat != null
          ? [sv.standort_lng, sv.standort_lat]
          : startStop && startStop.lat != null && startStop.lng != null
            ? [startStop.lng, startStop.lat]
            : null
      if (carCenter) {
        let bearing = DEFAULT_FIELD_MAP_CONFIG.bearing
        if (
          startStop &&
          startStop.lat != null &&
          startStop.lng != null &&
          (carCenter[0] !== startStop.lng || carCenter[1] !== startStop.lat)
        ) {
          const φ1 = (carCenter[1] * Math.PI) / 180
          const φ2 = (startStop.lat * Math.PI) / 180
          const Δλ = ((startStop.lng - carCenter[0]) * Math.PI) / 180
          const y = Math.sin(Δλ) * Math.cos(φ2)
          const x =
            Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
          bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
        }
        map.jumpTo({
          center: carCenter,
          // 2026-05-08 (C7): Pitch 70 + Zoom 18.5 ließ die Camera in
          // Innenstadt-Lagen durch Hochhäuser durchbrechen — Aaron-Smoke
          // „darf nicht in die Gebäude rein". Pitch auf 62° entschärft
          // das (Camera schaut mehr „über" als „durch"), zoom 17.8 gibt
          // mehr Skyline-Übersicht. Top-padding noch heavier damit Pin
          // im unteren Viertel sitzt und die Strecke voraus mehr Platz
          // hat. Optisch immer noch GMaps-Navi-Look.
          zoom: 17.8,
          pitch: 62,
          bearing,
          padding: { top: 360, bottom: 60, left: 40, right: 40 },
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
      svThreeHandleRef.current?.remove()
      svThreeHandleRef.current = null
      heroPinRef.current?.remove()
      heroPinRef.current = null
      google3dTilesRef.current?.remove()
      google3dTilesRef.current = null
      cesium3dTilesRef.current?.remove()
      cesium3dTilesRef.current = null
      blitzerRef.current?.remove()
      blitzerRef.current = null
      hazardsRef.current?.remove()
      hazardsRef.current = null
      flowRef.current?.remove()
      flowRef.current = null
      weatherFxRef.current?.remove()
      weatherFxRef.current = null
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
      heroPinRef.current?.setArrived(arrived)
    } catch { /* style not ready yet */ }
  }, [aktuellerStopIndex, stops, weatherId, arrived])

  // 2026-05-08 Blitzer-Voice + (C10) NaviHud-Notice. Bei jedem GPS-
  // Update prüfen wir die Distance zu allen geladenen Blitzern. Sobald
  // einer < 500 m bzw. < 200 m ist, sprechen wir die Anweisung aus UND
  // melden eine `blitzer`-Notice an den Caller — der NaviHud zeigt den
  // glassy roten Banner mit Distanz + ggf. Tempolimit.
  // Auto-Clear: wenn der nächste Blitzer > 500 m entfernt ist (oder
  // keine mehr in Range), notice=null.
  useEffect(() => {
    if (!svPosition) return
    const features = blitzerFeaturesRef.current
    if (features.length === 0) {
      onMapNotice?.(null)
      return
    }
    let nearest: { distM: number; isMobile: boolean; vmax: number | null } | null = null
    for (const f of features) {
      const [lng, lat] = f.geometry.coordinates
      const distM = haversineMetersLngLat([svPosition.lng, svPosition.lat], [lng, lat])
      const id = (f.properties as { id: string; type?: string }).id
      const isMobile = (f.properties as { type?: string }).type === '1'
      const vmaxRaw = (f.properties as { vmax?: string }).vmax
      const vmax = vmaxRaw != null ? Number.parseInt(vmaxRaw, 10) : null
      const label = isMobile ? 'Achtung, mobiler Blitzer' : 'Achtung, Blitzer'
      const key500 = `${id}-500`
      const key200 = `${id}-200`
      if (distM <= 200 && !warnedBlitzerIdsRef.current.has(key200)) {
        speakInstruction(`${label} in 200 Metern`)
        warnedBlitzerIdsRef.current.add(key200)
        warnedBlitzerIdsRef.current.add(key500)
      } else if (distM <= 500 && !warnedBlitzerIdsRef.current.has(key500)) {
        speakInstruction(`${label} in 500 Metern`)
        warnedBlitzerIdsRef.current.add(key500)
      }
      if (distM <= 600 && (!nearest || distM < nearest.distM)) {
        nearest = { distM, isMobile, vmax: Number.isFinite(vmax) ? vmax : null }
      }
    }
    if (nearest) {
      setBlitzerNotice({
        type: 'blitzer',
        mobile: nearest.isMobile,
        distanceLabel: formatNaviDistance(nearest.distM),
        vmaxKmh: nearest.vmax,
      })
    } else {
      setBlitzerNotice(null)
    }
  }, [svPosition])

  // 2026-05-08 (C10) Notice-Combiner: meldet höchste-Prio-Notice an
  // den Caller (FeldmodusClient → NaviHud). Prio: Blitzer > Reroute
  // (Reroute deckt sowohl 'faster' als auch 'hazard'-Reason ab).
  // Reroute-Notice wird hier dynamisch aus dem proposedReroute-State
  // gebaut + Accept/Dismiss-Handler eingebunden.
  useEffect(() => {
    if (!onMapNotice) return
    if (blitzerNotice) {
      onMapNotice(blitzerNotice)
      return
    }
    if (proposedReroute) {
      onMapNotice({
        type: 'reroute',
        reason: proposedReroute.reason,
        etaSavedSec: proposedReroute.etaSavedSec,
        hazardLabel: proposedReroute.hazardLabel,
        onAccept: () => handleAcceptReroute(),
        onDismiss: () => handleDismissReroute(),
      })
      return
    }
    onMapNotice(null)
    // handleAcceptReroute/handleDismissReroute ändern sich pro render —
    // deps lassen wir absichtlich auf den State-Hauptachsen, sonst
    // re-emittet jedes Render unnötig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blitzerNotice, proposedReroute, onMapNotice])

  // SV-Marker aktualisieren wenn svPosition sich ändert.
  // 2026-05-07: 3D-Modell-Pfad bevorzugt — wenn `sv3dHandleRef` da ist,
  // wird die Pose ueber den ModelSource gesetzt (echter 3D-Render mit
  // Mapbox-Schatten). Andernfalls bleibt der 2D-SVG-Marker aktiv.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!svPosition) return

    if (svThreeHandleRef.current) {
      svThreeHandleRef.current.update({
        lngLat: [svPosition.lng, svPosition.lat],
        heading: svPosition.heading,
      })
      return
    }
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

    // TbT-Modus: Map folgt SV mit Heading-Rotation (oder Bearing zum Stop
    // wenn kein heading da), nahem Zoom, hohem Pitch. 2026-05-07: bei
    // missing heading berechnen wir das Bearing vom SV → Stop, sonst
    // zeigt die Camera nordwärts statt in Fahrtrichtung.
    // 2026-05-08: Zoom 18.5 + Pitch 70 + bottom-heavy padding für den
    // Google-Maps-Navi-Look. Der SV-Pin sitzt im unteren Drittel, davor die
    // Strecke. Vorher (zoom 17, kein padding) wirkte die Karte „aus dem
    // Hubschrauber" — Aaron-Feedback nach dem 08.05. Smoke-Test.
    if (followSv && svPosition) {
      let bearing = svPosition.heading ?? 0
      if (svPosition.heading == null && aktuellerStop?.lat != null && aktuellerStop?.lng != null) {
        const φ1 = (svPosition.lat * Math.PI) / 180
        const φ2 = (aktuellerStop.lat * Math.PI) / 180
        const Δλ = ((aktuellerStop.lng - svPosition.lng) * Math.PI) / 180
        const y = Math.sin(Δλ) * Math.cos(φ2)
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
        bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
      }
      map.easeTo({
        center: [svPosition.lng, svPosition.lat],
        // 2026-05-08 (C7): Pitch 62 + Zoom 17.8 statt 70/18.5. Steiler
        // wäre cinematischer, aber Camera dringt dann in Buildings ein
        // (Aaron-Smoke „darf nicht in die Gebäude rein"). 62° + 17.8
        // hält Camera über der Skyline.
        zoom: 17.8,
        bearing,
        pitch: 62,
        padding: { top: 360, bottom: 60, left: 40, right: 40 },
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

    // 2026-05-08 PR B: Echtzeit-Traffic-Route mit Stau-Färbung.
    // fetchDrivingRoute liefert jetzt {primary, alternatives} mit per-
    // Segment-congestion. upsertTrafficRouteLayer rendert die primary-
    // Route GMaps-style farbig segmentiert (low=blau, moderate=amber,
    // heavy=orange, severe=rot).
    // Cache 60s — Traffic ändert sich schneller als statische Routen.
    // Alternativen werden hier (noch) nicht visualisiert — kommen mit dem
    // Live-Reroute-Toast in PR B2.
    const ctrl = new AbortController()
    // 2026-05-08 (C5): Route-Theme passt sich an Light-Preset des aktuellen
    // Termin-Slots an. Tag → dunkle Linie auf hellen Tiles, Nacht →
    // leuchtender Glow auf dunklen Tiles. Ohne Termin-Zeit → wall-clock.
    const targetStop = stops[Math.max(0, aktuellerStopIndex)] ?? null
    const lightAt = targetStop?.start_zeit ? new Date(targetStop.start_zeit) : new Date()
    const lightPreset = getMapboxLightPreset(lightAt)
    const drawRoute = (route: TrafficRoute) => {
      if (!map.isStyleLoaded()) {
        map.once('load', () => upsertTrafficRouteLayer(map, route, 'main', lightPreset))
      } else {
        upsertTrafficRouteLayer(map, route, 'main', lightPreset)
      }
    }
    void fetchDrivingRoute([svLng, svLat], [stopLng, stopLat], { signal: ctrl.signal })
      .then(async ({ primary }) => {
        drawRoute(primary)
        primaryRouteRef.current = primary
        // Blitzer (Atudo) + Verkehrshindernisse (HERE) + Off-Route-Stau-
        // Lines (HERE Flow) parallel laden. Off-Route-Flow bleibt als
        // Kontext-Layer drin — die Stau-Färbung der Hauptroute reicht
        // nicht aus um zu sehen wohin der Stau auf einer Alternative
        // führt. Opacity der Flow-Linie ist über hazards.ts definiert.
        const coords = primary.coords
        if (coords.length >= 2) {
          // 2026-05-08 Aaron-Audit: 0.5 km Puffer war zu eng — auf
          // einer 4 km Innenstadt-Route fanden wir 0 Blitzer obwohl
          // Atudo 22 in Köln-Region listet. Buffer 3 km erfasst Blitzer
          // entlang Hauptverbindungsstraßen ohne die Map zu überfluten.
          const bbox = bboxForRoute(coords, 3)
          const [blitzerFeatures, hazardFeatures, flowFeatures] = await Promise.all([
            fetchBlitzerInBbox(bbox),
            fetchHereHazards(bbox),
            fetchHereFlow(bbox),
          ])
          blitzerFeaturesRef.current = blitzerFeatures
          warnedBlitzerIdsRef.current.clear()
          hazardsDataRef.current = hazardFeatures
          if (!blitzerRef.current && map.isStyleLoaded()) {
            blitzerRef.current = attachBlitzerLayer(map, blitzerFeatures)
          } else if (blitzerRef.current) {
            blitzerRef.current.update(blitzerFeatures)
          }
          if (!hazardsRef.current && map.isStyleLoaded()) {
            hazardsRef.current = attachHazardLayer(map, hazardFeatures)
          } else if (hazardsRef.current) {
            hazardsRef.current.update(hazardFeatures)
          }
          if (!flowRef.current && map.isStyleLoaded()) {
            flowRef.current = attachFlowLayer(map, flowFeatures)
          } else if (flowRef.current) {
            flowRef.current.update(flowFeatures)
          }

          // 2026-05-08 (C12): Wetter-Animations-Layer entlang der Route.
          // Sample alle ~3 km, cluster gleiche Wetter-Codes, render
          // Particles. Best-effort — bei Fail (kein OpenWeatherMap-Key,
          // Netz-Fehler) bleibt die Route ohne Animation.
          void sampleWeatherAlongRoute(coords)
            .then((samples) => {
              const regions = clusterWeatherSamples(samples)
              if (!weatherFxRef.current && map.isStyleLoaded()) {
                weatherFxRef.current = attachWeatherFx(map)
              }
              weatherFxRef.current?.update(regions)
            })
            .catch(() => { /* noop — Wetter-FX ist Cosmetic */ })

          // 2026-05-08 PR B2: Hazard-on-Route-Detection (sofort).
          // Wenn ein Hazard innerhalb 50 m der primary-polyline liegt
          // UND wir ihn noch nicht vorgeschlagen haben, fetchen wir
          // die Alternativen synchron und triggern den Reroute-Toast.
          const hazardOnRoute = findHazardOnRoute(hazardFeatures, primary)
          if (hazardOnRoute) {
            const hid = (hazardOnRoute.properties as { id?: string }).id ?? ''
            if (!proposedHazardSeenIdsRef.current.has(hid)) {
              proposedHazardSeenIdsRef.current.add(hid)
              const distM = distanceToHazardM([svLng, svLat], hazardOnRoute)
              const distLabel = distM < 1000
                ? `${Math.round(distM / 50) * 50} m`
                : `${(distM / 1000).toFixed(1).replace('.', ',')} km`
              const desc = (hazardOnRoute.properties as { description?: string }).description
              const label = desc ? `${desc} in ${distLabel}` : `Hindernis in ${distLabel}`
              // Alternative gleich fetchen für die Toast-Action.
              const { alternatives } = await fetchDrivingRoute(
                [svLng, svLat],
                [stopLng, stopLat],
                { bypassCache: true },
              )
              const alt = alternatives[0] ?? null
              if (alt) {
                setProposedReroute({
                  route: alt,
                  reason: 'hazard',
                  etaSavedSec: 0,
                  hazardLabel: label,
                })
              }
            }
          }
        }
      })
    return () => ctrl.abort()
  }, [svPosition, aktuellerStop])

  // 2026-05-08 PR B2: Polling für schnellere Alternative.
  // Nur aktiv wenn followSv (TbT-Modus) UND noch > 1 km zum Stop. Innerhalb
  // 1 km macht Reroute keinen Sinn mehr (zu spät, würde nur verwirren).
  // Alle 30 s mit bypassCache:true → Mapbox-Quote-Impact: max 120 Calls/h
  // pro aktiv-fahrendem SV, davon greift der Großteil dank 60-s-Cache
  // gegen denselben Cache-Key nicht durch.
  useEffect(() => {
    if (!followSv) return
    if (!svPosition) return
    if (!aktuellerStop?.lat || !aktuellerStop?.lng) return
    const stopLat = aktuellerStop.lat
    const stopLng = aktuellerStop.lng
    const id = window.setInterval(async () => {
      const map = mapRef.current
      if (!map) return
      // Distance-Cutoff: in den letzten 1 km nicht mehr neu vorschlagen
      const distToStop = (() => {
        const φ1 = (svPosition.lat * Math.PI) / 180
        const φ2 = (stopLat * Math.PI) / 180
        const dLat = ((stopLat - svPosition.lat) * Math.PI) / 180
        const dLng = ((stopLng - svPosition.lng) * Math.PI) / 180
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLng / 2) ** 2
        return 2 * 6371000 * Math.asin(Math.sqrt(a))
      })()
      if (distToStop < 1000) return

      const { primary, alternatives } = await fetchDrivingRoute(
        [svPosition.lng, svPosition.lat],
        [stopLng, stopLat],
        { bypassCache: true },
      )
      if (primary.coords.length >= 2) {
        const targetStop = stops[Math.max(0, aktuellerStopIndex)] ?? null
        const lightAt = targetStop?.start_zeit ? new Date(targetStop.start_zeit) : new Date()
        upsertTrafficRouteLayer(map, primary, 'main', getMapboxLightPreset(lightAt))
        primaryRouteRef.current = primary
      }
      const fasterAlt = pickFasterAlternative(primary, alternatives)
      if (fasterAlt) {
        setProposedReroute((prev) => prev ?? {
          route: fasterAlt,
          reason: 'faster',
          etaSavedSec: primary.duration - fasterAlt.duration,
        })
      }
    }, REROUTE_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [followSv, svPosition?.lat, svPosition?.lng, aktuellerStop?.termin_id])

  // Reroute-Akzeptieren: alt zur primary machen + Toast schließen
  function handleAcceptReroute() {
    if (!proposedReroute) return
    const map = mapRef.current
    if (map) {
      const targetStop = stops[Math.max(0, aktuellerStopIndex)] ?? null
      const lightAt = targetStop?.start_zeit ? new Date(targetStop.start_zeit) : new Date()
      upsertTrafficRouteLayer(map, proposedReroute.route, 'main', getMapboxLightPreset(lightAt))
      primaryRouteRef.current = proposedReroute.route
    }
    setProposedReroute(null)
  }
  function handleDismissReroute() {
    setProposedReroute(null)
  }

  return (
    <div className="relative" style={{ width: '100%', height: '100%', minHeight: '100%' }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      {/* 2026-05-08 (C10): RerouteToast entfernt — wird jetzt vom NaviHud
          im FeldmodusClient gerendert (single Notification-Slot bottom-
          mittig statt Top-Banner-Konkurrenz). proposedReroute fließt via
          onMapNotice an den Caller. */}
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
