// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings fuer marker fills + paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import { MAPBOX_STYLE_STANDARD } from '@/lib/mapbox/styles'
import type { Map as MapboxMap, MapMouseEvent, MapboxGeoJSONFeature, GeoJSONSource } from 'mapbox-gl'
import ErrorState from '@/components/shared/ErrorState'
import type { LiveOpsData, LayerKey, LayerState, FilterState } from './types'
import type { LiveOpsRole } from '@/lib/live-ops'
import { svPinsFC, unionIsochroneFC, terminPinsFC, routenFC, tagesroutenFC, deadPinsFC, leadsFC, candidateHaloFC, assignLineFC } from './geo'
import { fetchDrivingRoute } from '@/lib/mapbox/directions'
import { computeCoverageGaps } from '@/lib/live-ops/coverage'
import { addSvCarMarker } from '@/lib/mapbox/sv-marker'
import SvPopup from './SvPopup'
import TerminPopup from './TerminPopup'
import LeadPopup from './LeadPopup'
import DeadPinDrawer from './DeadPinDrawer'
import AssignFromMapDrawer from './AssignFromMapDrawer'
import StatBar from './StatBar'
import LayerPanel from './LayerPanel'
import SidebarList from './SidebarList'
import type { SvLiveOps, TerminPin, LeadPin } from '@/lib/live-ops'
import { createClient } from '@/lib/supabase/client'

// ------------------------------------------------------------------ Props

export interface LiveOpsMapProps {
  role: LiveOpsRole
  data: LiveOpsData
  onRefresh?: () => void
  /** Basis-Pfad fuer "SV oeffnen" im SvPopup (z.B. Cockpit-@drawer). Undefined -> Default-Verhalten. */
  svHrefBase?: string
}

// ------------------------------------------------------------------ Layer-IDs

const SRC_SVS = 'lo-svs'
const SRC_ISOS = 'lo-isos'
const LAYER_SVS = 'lo-svs-circle'
const LAYER_ISOS_FILL = 'lo-isos-fill'
const LAYER_ISOS_LINE = 'lo-isos-line'

const SRC_TERMINE = 'lo-termine'
const LAYER_TERMINE = 'lo-termine-circle'
const LAYER_TERMINE_ETA = 'lo-termine-eta-label'

const SRC_ROUTEN = 'lo-routen'
const LAYER_ROUTEN = 'lo-routen-line'

const SRC_TAGESROUTEN = 'lo-tagesrouten'
const LAYER_TAGESROUTEN = 'lo-tagesrouten-line'

const SRC_DEADPINS = 'lo-deadpins'
const LAYER_DEADPINS = 'lo-deadpins-circle'

const SRC_LEADS = 'lo-leads'
const LAYER_LEADS = 'lo-leads-circle'
const LAYER_LEADS_CLUSTER = 'lo-leads-cluster'
const LAYER_LEADS_CLUSTER_COUNT = 'lo-leads-cluster-count'

const SRC_CAND = 'lo-cand-halo'
const LAYER_CAND = 'lo-cand-halo-circle'
const SRC_ASSIGN_LINE = 'lo-assign-line'
const LAYER_ASSIGN_LINE = 'lo-assign-line-line'

// Lead-Farben (raw hex ok — Token-Audit-Skip-Header oben; Mapbox-Paint-Property).
// Reihenfolge: Abdeckungsluecke (rot) hat Vorrang vor Status-Farbe.
const LEAD_STATUS_COLOR_EXPR = [
  'case',
  ['==', ['get', '__gap'], 1], '#ef4444',
  // kein Lücken-Lead → Status-Farbe
  ['match',
    ['get', 'status'],
    'neu', '#f59e0b',
    'offen', '#f59e0b',
    'aktiv', '#3b82f6',
    'in_bearbeitung', '#3b82f6',
    /* default */ '#94a3b8',
  ],
] as unknown as mapboxgl.Expression

// Dead-Pin-Status-Farben via match-Expression (raw hex ok — Token-Audit-Skip-Header oben)
const DEADPIN_STATUS_COLOR_EXPR = [
  'match',
  ['get', 'status'],
  'offen', '#94a3b8',
  'beansprucht_pending', '#f59e0b',
  'beansprucht', '#f59e0b',
  'konvertiert', '#22c55e',
  'abgelehnt', '#ef4444',
  /* default */ '#94a3b8',
] as unknown as mapboxgl.Expression

// Termin-Status-Farben via match-Expression (raw hex ok — Token-Audit-Skip-Header oben)
const TERMIN_STATUS_COLOR_EXPR = [
  'match',
  ['get', 'status'],
  'bestaetigt', '#22c55e',
  'reserviert', '#f59e0b',
  'unterwegs', '#3b82f6',
  'losgefahren', '#3b82f6',
  /* default */ '#94a3b8',
] as unknown as mapboxgl.Expression

// Typ-Farben via match-Expression (raw hex ist ok — Token-Audit-Skip-Header oben)
const TYP_COLOR_EXPR = [
  'match',
  ['get', 'typ'],
  'kfz', '#3b82f6',
  'dat', '#f97316',
  'akademie', '#22c55e',
  'buero', '#a855f7',
  /* default */ '#4573A2',
] as unknown as mapboxgl.Expression

// ------------------------------------------------------------------ Default Layer/Filter State

const DEFAULT_LAYERS: LayerState = {
  svs: true,
  autos: true,
  termine: true,
  routen: true,
  tagesrouten: false,
  deadpins: true,
  leads: true,
}

const DEFAULT_FILTER: FilterState = {
  typ: 'alle',
  nurVerifiziert: false,
  nurUnterwegs: false,
}

// ------------------------------------------------------------------ Component

export default function LiveOpsMap({ role, data, onRefresh, svHrefBase }: LiveOpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // retryKey wird bei Retry inkrementiert → loest useEffect-Re-Mount aus
  const [retryKey, setRetryKey] = useState(0)

  // Layer + Filter (Task 6)
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS)
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)

  // Hover-Sync (fuer Sidebar-Task 6)
  const [hoveredSvId, setHoveredSvId] = useState<string | null>(null)

  // Dead-Pin-Drawer-State
  const [openDeadPinId, setOpenDeadPinId] = useState<string | null>(null)
  const [deadPinAnlegeModus, setDeadPinAnlegeModus] = useState(false)
  const [neuerDeadPinCoord, setNeuerDeadPinCoord] = useState<{ lng: number; lat: number } | null>(null)

  // Assign-from-Map-State
  const [assignLeadId, setAssignLeadId] = useState<string | null>(null)
  const [candidateSvIds, setCandidateSvIds] = useState<string[]>([])
  const [previewSvId, setPreviewSvId] = useState<string | null>(null)

  // Verhindert, dass der Fehlerfall bei HMR-Reload falsch ausloest.
  const mountedRef = useRef(false)

  // Car-Marker pro SV-ID
  const carMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

  // Popup-Roots: mehrere koennen gleichzeitig existieren (ein aktiver Popup
  // plus "close"-Handler der noch lauft).
  const popupRootsRef = useRef<Set<Root>>(new Set())

  // Stabile Referenz auf aktuelle data.svs fuer Klick-Handler-Closures
  const svsRef = useRef<SvLiveOps[]>(data.svs)
  useEffect(() => {
    svsRef.current = data.svs
  }, [data.svs])

  // Stabile Referenz auf aktuelle data.termine fuer Klick-Handler-Closures
  const termineRef = useRef<TerminPin[]>(data.termine)
  useEffect(() => {
    termineRef.current = data.termine
  }, [data.termine])

  // Stabile Referenz auf aktuelle data.leads fuer Klick-Handler-Closures
  const leadsRef = useRef<LeadPin[]>(data.leads)
  useEffect(() => {
    leadsRef.current = data.leads
  }, [data.leads])

  // Stabile Referenz auf onRefresh fuer Realtime-Handler
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  // Gefilterte SVs fuer Sidebar + Layer-Daten
  const filteredSvs = useMemo<SvLiveOps[]>(() => {
    return data.svs.filter((sv) => {
      if (filter.typ !== 'alle' && sv.typ !== filter.typ) return false
      if (filter.nurVerifiziert && !sv.verifiziert) return false
      if (filter.nurUnterwegs && sv.car.mode === 'none') return false
      return true
    })
  }, [data.svs, filter])

  // Abdeckungsluecken: Lead-IDs ohne deckende SV-Isochrone (alle SVs, ungefiltert)
  const gapIds = useMemo(
    () => computeCoverageGaps(data.leads, data.svs),
    [data.leads, data.svs],
  )

  const handleRetry = useCallback(() => {
    setError(null)
    setReady(false)
    setRetryKey((k) => k + 1)
  }, [])

  // ------ Layer-Toggle: setzt Mapbox-Layer-Visibility + Car-Marker display

  const handleLayerToggle = useCallback((key: LayerKey) => {
    setLayers((prev) => {
      const on = !prev[key]
      const map = mapRef.current
      if (map) {
        // Layer-Keys → Mapbox-Layer-IDs
        const layerIds: Record<LayerKey, string[]> = {
          svs: [LAYER_SVS, LAYER_ISOS_FILL, LAYER_ISOS_LINE],
          autos: [], // Car-Marker werden per display-Style getoggelt
          termine: [LAYER_TERMINE, LAYER_TERMINE_ETA],
          routen: [LAYER_ROUTEN],
          tagesrouten: [LAYER_TAGESROUTEN],
          deadpins: [LAYER_DEADPINS],
          leads: [LAYER_LEADS, LAYER_LEADS_CLUSTER, LAYER_LEADS_CLUSTER_COUNT],
        }
        for (const layerId of layerIds[key]) {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
          }
        }
        // Car-Marker (kein Layer, sondern DOM-Marker)
        if (key === 'autos') {
          carMarkersRef.current.forEach((marker) => {
            marker.getElement().style.display = on ? '' : 'none'
          })
        }
      }
      return { ...prev, [key]: on }
    })
  }, [])

  // ------ Filter-Update

  const handleFilter = useCallback((f: Partial<FilterState>) => {
    setFilter((prev) => ({ ...prev, ...f }))
  }, [])

  // ------ openSvPopup: createRoot + mapboxgl.Popup

  const openSvPopup = useCallback(
    (svId: string) => {
      const map = mapRef.current
      if (!map) return
      const sv = svsRef.current.find((s) => s.id === svId)
      if (!sv) return

      // Popup-Position: Auto-Pos bevorzugt, fallback Standort
      const hasCarPos =
        sv.car.mode !== 'none' && sv.car.lat != null && sv.car.lng != null
      const lngLat: [number, number] = hasCarPos
        ? [sv.car.lng as number, sv.car.lat as number]
        : [sv.standortLng ?? 10.45, sv.standortLat ?? 51.16]

      const container = document.createElement('div')
      const root = createRoot(container)
      popupRootsRef.current.add(root)

      root.render(<SvPopup sv={sv} role={role} svHrefBase={svHrefBase} />)

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
        .setLngLat(lngLat)
        .setDOMContent(container)
        .addTo(map)

      popup.on('close', () => {
        root.unmount()
        popupRootsRef.current.delete(root)
      })
    },
    [role, svHrefBase],
  )

  // ------ openTerminPopup: analog zu openSvPopup

  const openTerminPopup = useCallback(
    (terminId: string) => {
      const map = mapRef.current
      if (!map) return
      const termin = termineRef.current.find((t) => t.id === terminId)
      if (!termin) return

      const container = document.createElement('div')
      const root = createRoot(container)
      popupRootsRef.current.add(root)

      root.render(<TerminPopup termin={termin} role={role} />)

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
        .setLngLat([termin.lng, termin.lat])
        .setDOMContent(container)
        .addTo(map)

      popup.on('close', () => {
        root.unmount()
        popupRootsRef.current.delete(root)
      })
    },
    [role],
  )

  // ------ openLeadPopup: analog zu openTerminPopup

  const openLeadPopup = useCallback(
    (leadId: string, coords: [number, number]) => {
      const map = mapRef.current
      if (!map) return
      const lead = leadsRef.current.find((l) => l.id === leadId)
      if (!lead) return

      const container = document.createElement('div')
      const root = createRoot(container)
      popupRootsRef.current.add(root)

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
        .setLngLat(coords)
        .setDOMContent(container)
        .addTo(map)

      root.render(<LeadPopup lead={lead} role={role} onAssign={(lId) => {
        setAssignLeadId(lId)
        popup.remove()
      }} />)

      popup.on('close', () => {
        root.unmount()
        popupRootsRef.current.delete(root)
      })
    },
    [role],
  )

  // ------ Hilfsfunktion: Car-Marker aufbauen

  const buildCarMarkers = useCallback(
    (map: MapboxMap, svs: SvLiveOps[]) => {
      svs.forEach((sv) => {
        const hasCar =
          sv.car.mode !== 'none' &&
          sv.car.lat != null &&
          sv.car.lng != null
        if (!hasCar) return

        const marker = addSvCarMarker(
          map,
          [sv.car.lng as number, sv.car.lat as number],
          { heading: sv.car.heading ?? undefined },
        )

        // Klick auf Auto-Element
        const el = marker.getElement()
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => openSvPopup(sv.id))

        // "unterwegs_derived" → leicht dimmen + title-Hinweis
        if (sv.car.mode === 'unterwegs_derived') {
          el.style.opacity = '0.7'
          el.title = 'Position geschätzt'
        }

        carMarkersRef.current.set(sv.id, marker)
      })
    },
    [openSvPopup],
  )

  // ------ Hilfsfunktion: Car-Marker abraeumen

  const clearCarMarkers = useCallback(() => {
    carMarkersRef.current.forEach((m) => m.remove())
    carMarkersRef.current.clear()
  }, [])

  // ------ Map mount / teardown

  useEffect(() => {
    if (!containerRef.current) return
    mountedRef.current = true

    const ok = ensureMapboxInitialized()
    if (!ok) {
      setError('kein Token')
      return
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_STANDARD,
      center: [10.45, 51.16],
      zoom: 5.4,
      pitch: 45,
      attributionControl: false,
    })

    // 3D-Standard-Style Konfiguration — analog TagesrouteMap.
    // Auf 'style.load' (nicht 'load') weil Standard-Style Config-Properties
    // erst nach dem Style-Load gesetzt werden koennen.
    map.on('style.load', () => {
      try {
        // Aaron 07.07.: SV-Live-Ops-Karte bleibt 3D, aber IMMER Tages-Licht
        // (fest 'day' statt uhrzeitabhaengig -> nie mehr naechtlich-dunkel).
        map.setConfigProperty('basemap', 'lightPreset', 'day')
        map.setConfigProperty('basemap', 'show3dObjects', true)
        map.setConfigProperty('basemap', 'showPlaceLabels', true)
        map.setConfigProperty('basemap', 'showRoadLabels', true)
      } catch { /* noop — Standard-Style noch nicht bereit */ }
    })

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false }),
      'top-right',
    )

    map.on('load', () => {
      if (!mountedRef.current) return

      // ─── Isochrone-Layer (Union) ───────────────────────────────────────
      // Die Union-Flaeche fasst alle SV-Isochronen zu EINER Flaeche zusammen.
      // TYP_COLOR_EXPR entfaellt: die Union hat kein `typ`-Property (typ-uebergreifend).
      // Stattdessen eine einheitliche Marken-Farbe (#4573A2 = claimondo-secondary;
      // raw hex ok — Token-Audit-Skip-Header oben; Mapbox-Paint-Property).
      map.addSource(SRC_ISOS, {
        type: 'geojson',
        data: unionIsochroneFC(svsRef.current),
      })

      map.addLayer({
        id: LAYER_ISOS_FILL,
        type: 'fill',
        source: SRC_ISOS,
        slot: 'middle',
        paint: {
          'fill-color': '#4573A2',
          'fill-opacity': 0.18,
        },
      } as Parameters<typeof map.addLayer>[0])

      map.addLayer({
        id: LAYER_ISOS_LINE,
        type: 'line',
        source: SRC_ISOS,
        slot: 'middle',
        paint: {
          // Union-Aussengrenze — kein inneres Kanten-Chaos mehr (kein per-SV-Overlap).
          'line-color': '#4573A2',
          'line-width': 2,
          'line-opacity': 0.7,
        },
      } as Parameters<typeof map.addLayer>[0])

      // ─── SV-Pin-Layer ──────────────────────────────────────────────────
      map.addSource(SRC_SVS, {
        type: 'geojson',
        data: svPinsFC(svsRef.current),
      })

      map.addLayer({
        id: LAYER_SVS,
        type: 'circle',
        source: SRC_SVS,
        slot: 'top',
        paint: {
          'circle-color': TYP_COLOR_EXPR,
          'circle-radius': 7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      } as Parameters<typeof map.addLayer>[0])

      // Klick auf SV-Pin → Popup
      map.on(
        'click',
        LAYER_SVS,
        (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const svId = feature.properties?.__id as string
          openSvPopup(svId)
        },
      )

      // Hover-Cursor + Hover-State-Sync
      map.on('mouseenter', LAYER_SVS, (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
        map.getCanvas().style.cursor = 'pointer'
        const id = e.features?.[0]?.properties?.__id as string | undefined
        if (id) setHoveredSvId(id)
      })
      map.on('mouseleave', LAYER_SVS, () => {
        map.getCanvas().style.cursor = ''
        setHoveredSvId(null)
      })

      // ─── Live-Auto-Marker ──────────────────────────────────────────────
      buildCarMarkers(map, svsRef.current)

      // ─── Termin-Pins ───────────────────────────────────────────────────
      map.addSource(SRC_TERMINE, {
        type: 'geojson',
        data: terminPinsFC(termineRef.current),
      })

      map.addLayer({
        id: LAYER_TERMINE,
        type: 'circle',
        source: SRC_TERMINE,
        slot: 'top',
        paint: {
          'circle-color': TERMIN_STATUS_COLOR_EXPR,
          'circle-radius': 5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      } as Parameters<typeof map.addLayer>[0])

      // Klick auf Termin-Pin → Popup
      map.on(
        'click',
        LAYER_TERMINE,
        (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const terminId = feature.properties?.__id as string
          openTerminPopup(terminId)
        },
      )

      map.on('mouseenter', LAYER_TERMINE, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', LAYER_TERMINE, () => {
        map.getCanvas().style.cursor = ''
      })

      // ─── ETA-Label an Termin-Pins (raw hex ok — Token-Audit-Skip-Header oben; Mapbox-Paint) ──
      map.addLayer({
        id: LAYER_TERMINE_ETA,
        type: 'symbol',
        source: SRC_TERMINE,
        slot: 'top',
        filter: ['has', 'etaMin'],
        layout: {
          'text-field': ['concat', ['to-string', ['get', 'etaMin']], ' min'],
          'text-size': 10,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-offset': [0, -1.4],
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#0D1B3E',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      } as Parameters<typeof map.addLayer>[0])

      // ─── Unterwegs-Routen-Layer ─────────────────────────────────────────
      map.addSource(SRC_ROUTEN, {
        type: 'geojson',
        data: routenFC(data.routen),
      })

      map.addLayer({
        id: LAYER_ROUTEN,
        type: 'line',
        source: SRC_ROUTEN,
        slot: 'middle',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#0D1B3E',
          'line-width': 4,
          'line-opacity': 0.6,
        },
      } as Parameters<typeof map.addLayer>[0])

      // ─── Tagesrouten-Layer (default: unsichtbar, wird in Task 6 getoggelt) ──
      map.addSource(SRC_TAGESROUTEN, {
        type: 'geojson',
        data: tagesroutenFC(data.tagesrouten),
      })

      map.addLayer({
        id: LAYER_TAGESROUTEN,
        type: 'line',
        source: SRC_TAGESROUTEN,
        slot: 'middle',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: 'none',
        },
        paint: {
          'line-color': '#94a3b8',
          'line-width': 3,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2],
        },
      } as Parameters<typeof map.addLayer>[0])

      // ─── Dead-Pin-Layer (nur fuer admin + dispatch) ─────────────────────
      if (role !== 'kundenbetreuer') {
        map.addSource(SRC_DEADPINS, {
          type: 'geojson',
          data: deadPinsFC(data.deadPins),
        })

        map.addLayer({
          id: LAYER_DEADPINS,
          type: 'circle',
          source: SRC_DEADPINS,
          slot: 'top',
          paint: {
            'circle-color': DEADPIN_STATUS_COLOR_EXPR,
            'circle-radius': 6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.75,
          },
        } as Parameters<typeof map.addLayer>[0])

        // Klick auf Dead-Pin → Drawer oeffnen
        map.on(
          'click',
          LAYER_DEADPINS,
          (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
            const feature = e.features?.[0]
            if (!feature) return
            const pinId = feature.properties?.__id as string
            setOpenDeadPinId(pinId)
          },
        )

        map.on('mouseenter', LAYER_DEADPINS, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LAYER_DEADPINS, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      // ─── Lead-Pins (nur fuer admin + dispatch) — mit Cluster ──────────
      if (role !== 'kundenbetreuer') {
        map.addSource(SRC_LEADS, {
          type: 'geojson',
          data: leadsFC(leadsRef.current, gapIds),
          cluster: true,
          clusterMaxZoom: 8,
          clusterRadius: 50,
        })

        // Cluster-Circle-Layer
        map.addLayer({
          id: LAYER_LEADS_CLUSTER,
          type: 'circle',
          source: SRC_LEADS,
          slot: 'top',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#f59e0b',
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              16, 10, 22, 50, 28,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9,
          },
        } as Parameters<typeof map.addLayer>[0])

        // Cluster-Count-Label
        map.addLayer({
          id: LAYER_LEADS_CLUSTER_COUNT,
          type: 'symbol',
          source: SRC_LEADS,
          slot: 'top',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 11,
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': '#ffffff',
          },
        } as Parameters<typeof map.addLayer>[0])

        // Klick auf Cluster → reinzoomen
        map.on(
          'click',
          LAYER_LEADS_CLUSTER,
          (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
            const feature = e.features?.[0]
            if (!feature) return
            const clusterId = feature.properties?.cluster_id as number
            const source = map.getSource(SRC_LEADS) as GeoJSONSource
            source.getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err || typeof zoom !== 'number') return
              const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
              map.easeTo({ center: coords, zoom })
            })
          },
        )

        map.on('mouseenter', LAYER_LEADS_CLUSTER, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LAYER_LEADS_CLUSTER, () => {
          map.getCanvas().style.cursor = ''
        })

        // Einzel-Lead-Pin (unclustered)
        map.addLayer({
          id: LAYER_LEADS,
          type: 'circle',
          source: SRC_LEADS,
          slot: 'top',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': LEAD_STATUS_COLOR_EXPR,
            'circle-radius': 6,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.85,
          },
        } as Parameters<typeof map.addLayer>[0])

        // Klick auf Einzel-Lead-Pin → Popup
        map.on(
          'click',
          LAYER_LEADS,
          (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
            const feature = e.features?.[0]
            if (!feature) return
            const leadId = feature.properties?.__id as string
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
            openLeadPopup(leadId, coords)
          },
        )

        map.on('mouseenter', LAYER_LEADS, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LAYER_LEADS, () => {
          map.getCanvas().style.cursor = ''
        })

        // ─── Kandidaten-Halo-Layer (Assign-from-Map) ───────────────────────
        map.addSource(SRC_CAND, {
          type: 'geojson',
          data: candidateHaloFC([], []),
        })

        map.addLayer({
          id: LAYER_CAND,
          type: 'circle',
          source: SRC_CAND,
          slot: 'top',
          paint: {
            'circle-radius': 16,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-color': '#4573A2',
            'circle-stroke-width': 3,
            'circle-opacity': 0.9,
          },
        } as Parameters<typeof map.addLayer>[0])

        // ─── Verbindungslinie (Assign-from-Map) ────────────────────────────
        map.addSource(SRC_ASSIGN_LINE, {
          type: 'geojson',
          data: assignLineFC(null, null),
        })

        map.addLayer({
          id: LAYER_ASSIGN_LINE,
          type: 'line',
          source: SRC_ASSIGN_LINE,
          slot: 'middle',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#4573A2',
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [2, 1],
          },
        } as Parameters<typeof map.addLayer>[0])
      }

      setReady(true)
    })

    map.on('error', (e) => {
      console.error('[LiveOpsMap] Mapbox-Fehler', e)
      if (mountedRef.current) {
        setError('Kartenfehler: ' + (e.error?.message ?? 'unbekannt'))
      }
    })

    mapRef.current = map

    return () => {
      mountedRef.current = false
      clearCarMarkers()
      popupRootsRef.current.forEach((r) => r.unmount())
      popupRootsRef.current.clear()
      map.remove()
      mapRef.current = null
    }
    // retryKey steuert Re-Mount bei Retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey])

  // ------ Rebuild-Effect: bei Daten-Aenderung Sources updaten + Marker neu bauen
  // Hinweis: filteredSvs kapselt data.svs + filter -> dieser Effect triggert bei
  // beidem und bleibt die einzige Source fuer SV-Source + Car-Marker.

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    // Source-Data updaten (kein doppeltes addSource/addLayer — guarde per getSource)
    if (map.getSource(SRC_SVS)) {
      ;(map.getSource(SRC_SVS) as GeoJSONSource).setData(svPinsFC(filteredSvs))
    }
    if (map.getSource(SRC_ISOS)) {
      ;(map.getSource(SRC_ISOS) as GeoJSONSource).setData(unionIsochroneFC(filteredSvs))
    }

    // Car-Marker: alte entfernen, neue aufbauen (nur gefilterte SVs)
    clearCarMarkers()
    buildCarMarkers(map, filteredSvs)

    // Layer-Visibility fuer autos nach Rebuild sicherstellen
    carMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = layers.autos ? '' : 'none'
    })
  }, [filteredSvs, ready, clearCarMarkers, buildCarMarkers, layers.autos])

  // ------ Rebuild-Effect: Termine-Source bei Daten-Aenderung updaten

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    if (map.getSource(SRC_TERMINE)) {
      (map.getSource(SRC_TERMINE) as GeoJSONSource).setData(terminPinsFC(data.termine))
    }
  }, [data.termine, ready])

  // ------ Rebuild-Effect: Routen-Sources bei Daten-Aenderung updaten

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    if (map.getSource(SRC_ROUTEN)) {
      (map.getSource(SRC_ROUTEN) as GeoJSONSource).setData(routenFC(data.routen))
    }
    if (map.getSource(SRC_TAGESROUTEN)) {
      (map.getSource(SRC_TAGESROUTEN) as GeoJSONSource).setData(tagesroutenFC(data.tagesrouten))
    }
  }, [data.routen, data.tagesrouten, ready])

  // ------ Rebuild-Effect: Dead-Pins bei Daten-Aenderung updaten

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    if (map.getSource(SRC_DEADPINS)) {
      (map.getSource(SRC_DEADPINS) as GeoJSONSource).setData(deadPinsFC(data.deadPins))
    }
  }, [data.deadPins, ready])

  // ------ Rebuild-Effect: Leads bei Daten-Aenderung oder Abdeckungsluecken updaten

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    if (map.getSource(SRC_LEADS)) {
      (map.getSource(SRC_LEADS) as GeoJSONSource).setData(leadsFC(data.leads, gapIds))
    }
  }, [data.leads, gapIds, ready])

  // ------ Rebuild-Effect: Kandidaten-Halos bei candidateSvIds-Aenderung updaten

  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource(SRC_CAND) as GeoJSONSource | undefined
    if (src) src.setData(candidateHaloFC(data.svs, candidateSvIds))
  }, [candidateSvIds, data.svs])

  // ------ Rebuild-Effect: Verbindungslinie bei Hover-SV/Assign-Lead-Aenderung updaten
  // V2: setzt sofort eine gerade Linie (Sofort-Feedback), holt dann async die
  // echte Fahrroute via fetchDrivingRoute. AbortController pro Effekt-Lauf damit
  // ein Hover-Wechsel den alten Fetch canceled. Bei Abort/Fehler bleibt die
  // gerade Linie sichtbar (kein Throw ins UI).

  useEffect(() => {
    const map = mapRef.current
    const src = map?.getSource(SRC_ASSIGN_LINE) as GeoJSONSource | undefined
    if (!src) return
    const sv = data.svs.find((s) => s.id === previewSvId)
    const lead = leadsRef.current.find((l) => l.id === assignLeadId)
    const from = sv?.standortLat != null && sv.standortLng != null ? [sv.standortLng, sv.standortLat] as [number, number] : null
    const to = lead ? [lead.lng, lead.lat] as [number, number] : null
    src.setData(assignLineFC(from, to)) // Sofort: gerade Linie
    if (!from || !to) return
    const ctrl = new AbortController()
    fetchDrivingRoute(from, to, { signal: ctrl.signal })
      .then((r) => {
        const s = mapRef.current?.getSource(SRC_ASSIGN_LINE) as GeoJSONSource | undefined
        if (s && r.primary?.coords?.length) {
          s.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: r.primary.coords }, properties: {} }] })
        }
      })
      .catch(() => {}) // Abort/Fehler: gerade Linie bleibt
    return () => ctrl.abort()
  }, [previewSvId, assignLeadId, data.svs])

  // ------ Realtime: Supabase-Kanal fuer sv_live_location-Aenderungen

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('live-ops-positions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sv_live_location' },
        () => {
          onRefreshRef.current?.()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // ------ Anlege-Modus: Cursor + Klick-Handler fuer Koordinaten-Setzung

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    if (!deadPinAnlegeModus) {
      map.getCanvas().style.cursor = ''
      return
    }

    map.getCanvas().style.cursor = 'crosshair'

    function handleMapClick(e: mapboxgl.MapMouseEvent) {
      const { lng, lat } = e.lngLat
      setNeuerDeadPinCoord({ lng, lat })
      setDeadPinAnlegeModus(false)
      setOpenDeadPinId(null)
      // Cursor zuruecksetzen
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
    }

    map.once('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
      map.getCanvas().style.cursor = ''
    }
  }, [deadPinAnlegeModus, ready])

  // ------ Hover-Sync: Car-Marker-Zoom bei gesetztem hoveredSvId

  useEffect(() => {
    carMarkersRef.current.forEach((marker, svId) => {
      const el = marker.getElement()
      if (hoveredSvId === svId) {
        el.style.transform = (el.style.transform ?? '') + ' scale(1.25)'
      } else {
        // Nur "scale(1.25)" entfernen, bestehende Rotation beibehalten
        el.style.transform = el.style.transform.replace(/\s*scale\(1\.25\)/, '')
      }
    })
  }, [hoveredSvId])

  // ------ Render: Fehler-Zustand

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-claimondo-bg">
        <ErrorState
          title="Karte konnte nicht geladen werden"
          description={
            error === 'kein Token'
              ? 'Mapbox-Token fehlt — bitte NEXT_PUBLIC_MAPBOX_TOKEN setzen.'
              : 'Ein Fehler ist aufgetreten. Bitte erneut versuchen.'
          }
          retry={handleRetry}
          retryLabel="Erneut versuchen"
          className="max-w-sm"
        />
      </div>
    )
  }

  // ------ Render: Karte (+ Loading-Overlay bis ready)

  return (
    <div className="relative h-full w-full">
      {/* Mapbox-Container — inline inset statt Tailwind-inset (verhindert Klassen-Konflikt) */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
        aria-label="SV-Live-Ops-Karte"
      />

      {/* Loading-Overlay bis map.on('load') */}
      {!ready && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-claimondo-bg/80"
          aria-live="polite"
          aria-label="Karte wird geladen"
        >
          <div
            className="h-10 w-10 animate-spin rounded-ios-lg border-4 border-claimondo-border border-t-claimondo-navy"
            role="status"
          />
        </div>
      )}

      {/* StatBar — oben zentriert */}
      {ready && (
        <StatBar data={data} coverageGaps={gapIds.size} />
      )}

      {/* LayerPanel — links */}
      {ready && (
        <LayerPanel
          layers={layers}
          onToggle={handleLayerToggle}
          filter={filter}
          onFilter={handleFilter}
        />
      )}

      {/* SidebarList — rechts */}
      {ready && (
        <SidebarList
          svs={filteredSvs}
          termine={data.termine}
          hoveredSvId={hoveredSvId}
          onHover={setHoveredSvId}
          onSelect={openSvPopup}
        />
      )}

      {/* Dead-Pin-Drawer (nur fuer admin + dispatch) */}
      {role !== 'kundenbetreuer' && (
        <DeadPinDrawer
          pins={data.deadPins}
          openId={openDeadPinId}
          onClose={() => {
            setOpenDeadPinId(null)
            setNeuerDeadPinCoord(null)
          }}
          role={role}
          neuerCoord={neuerDeadPinCoord}
          onAnlegeModus={(on) => {
            setDeadPinAnlegeModus(on)
            if (!on) setNeuerDeadPinCoord(null)
          }}
        />
      )}

      {/* Assign-from-Map-Drawer (nur fuer admin + dispatch, wenn Lead ausgewaehlt) */}
      {assignLeadId && (role === 'admin' || role === 'dispatch') && (
        <AssignFromMapDrawer
          leadId={assignLeadId}
          leadName={leadsRef.current.find((l) => l.id === assignLeadId)?.name ?? 'Lead'}
          onCandidates={setCandidateSvIds}
          onPreviewSv={setPreviewSvId}
          onAssigned={() => { setAssignLeadId(null); setCandidateSvIds([]); setPreviewSvId(null); onRefresh?.() }}
          onClose={() => { setAssignLeadId(null); setCandidateSvIds([]); setPreviewSvId(null) }}
        />
      )}
    </div>
  )
}
