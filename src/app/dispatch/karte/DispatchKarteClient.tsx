'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type {
  Map as MapboxMap,
  MapMouseEvent,
  MapboxGeoJSONFeature,
  GeoJSONSource,
  Popup,
} from 'mapbox-gl'
import type {
  KarteSnapshot,
  LayerKey,
  SVPin,
  TerminPin,
  TriageLeadPin,
} from '@/lib/dispatch/karte/types'
import LeadPopup from './LeadPopup'
import SVPopup from './SVPopup'
import TerminPopup from './TerminPopup'
import LayerChipBar from './LayerChipBar'
import UnlocalizedSidebar from './UnlocalizedSidebar'
import { useTriageRealtime } from './useTriageRealtime'
import { refetchKarteSnapshot } from './actions'

const DEFAULT_CENTER: [number, number] = [10.45, 51.16]
const DEFAULT_ZOOM = 5.4

// AAR-912: Source-IDs pro Layer
const SRC = {
  leads: 'src-leads',
  svs: 'src-svs',
  termine: 'src-termine',
} as const
const LAYER_POINT = {
  leads: 'lay-leads-pt',
  svs: 'lay-svs-pt',
  termine: 'lay-termine-pt',
} as const
const LAYER_CLUSTER = {
  leads: 'lay-leads-cl',
  svs: 'lay-svs-cl',
  termine: 'lay-termine-cl',
} as const
const LAYER_CLUSTER_COUNT = {
  leads: 'lay-leads-clc',
  svs: 'lay-svs-clc',
  termine: 'lay-termine-clc',
} as const

function leadsToGeoJSON(pins: TriageLeadPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { __pinType: 'leads', __id: p.id, geoSource: p.geoSource },
    })),
  }
}
function svsToGeoJSON(pins: SVPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { __pinType: 'svs', __id: p.id },
    })),
  }
}
function termineToGeoJSON(pins: TerminPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { __pinType: 'termine', __id: p.id, status: p.status },
    })),
  }
}

export default function DispatchKarteClient({
  initialSnapshot,
}: {
  initialSnapshot: KarteSnapshot
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const popupRootRef = useRef<Root | null>(null)
  const snapshotRef = useRef<KarteSnapshot>(initialSnapshot)
  const [snapshot, setSnapshot] = useState<KarteSnapshot>(initialSnapshot)
  const [visibility, setVisibility] = useState<Record<LayerKey, boolean>>({
    leads: true,
    svs: true,
    termine: true,
  })
  const [tokenOk, setTokenOk] = useState<boolean>(true)
  const initialFitDoneRef = useRef(false)

  // snapshotRef immer aktuell halten — click-Handler von map.on() greifen
  // sonst auf stale closures zurück.
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  // Popup mit React-Render via createRoot
  const openPopup = useCallback((map: MapboxMap, coords: [number, number], type: LayerKey, id: string) => {
    popupRef.current?.remove()
    popupRootRef.current?.unmount()
    popupRootRef.current = null

    const container = document.createElement('div')
    const root = createRoot(container)
    const snap = snapshotRef.current

    if (type === 'leads') {
      const pin = snap.leads.find((p) => p.id === id)
      if (!pin) {
        root.unmount()
        return
      }
      root.render(<LeadPopup pin={pin} />)
    } else if (type === 'svs') {
      const pin = snap.svs.find((p) => p.id === id)
      if (!pin) {
        root.unmount()
        return
      }
      root.render(<SVPopup pin={pin} />)
    } else {
      const pin = snap.termine.find((p) => p.id === id)
      if (!pin) {
        root.unmount()
        return
      }
      root.render(<TerminPopup pin={pin} />)
    }

    const popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
      .setLngLat(coords)
      .setDOMContent(container)
      .addTo(map)

    popup.on('close', () => {
      root.unmount()
      if (popupRef.current === popup) popupRef.current = null
      if (popupRootRef.current === root) popupRootRef.current = null
    })

    popupRef.current = popup
    popupRootRef.current = root
  }, [])

  // Map mount
  useEffect(() => {
    if (!containerRef.current) return
    const ok = ensureMapboxInitialized()
    setTokenOk(ok)
    if (!ok) return

    const styleUrl =
      process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/light-v11'

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('load', () => {
      ;(['leads', 'svs', 'termine'] as LayerKey[]).forEach((key) => {
        map.addSource(SRC[key], {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterMaxZoom: 8,
          clusterRadius: 50,
        })

        // Cluster-Circle
        map.addLayer({
          id: LAYER_CLUSTER[key],
          type: 'circle',
          source: SRC[key],
          filter: ['has', 'point_count'],
          paint: {
            'circle-color':
              key === 'svs'
                ? 'rgba(30,58,95,0.85)'
                : key === 'termine'
                  ? 'rgba(245,158,11,0.85)'
                  : 'rgba(13,27,62,0.85)',
            'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        })

        // Cluster-Count-Label
        map.addLayer({
          id: LAYER_CLUSTER_COUNT[key],
          type: 'symbol',
          source: SRC[key],
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: { 'text-color': '#ffffff' },
        })

        // Einzelpunkte
        map.addLayer({
          id: LAYER_POINT[key],
          type: 'circle',
          source: SRC[key],
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color':
              key === 'leads'
                ? [
                    'case',
                    ['==', ['get', 'geoSource'], 'plz_centroid'],
                    'rgba(123,163,204,1)',
                    'rgba(13,27,62,1)',
                  ]
                : key === 'svs'
                  ? 'rgba(30,58,95,1)'
                  : [
                      'match',
                      ['get', 'status'],
                      'vorgeschlagen',
                      '#F59E0B',
                      'bestaetigt',
                      '#10B981',
                      'sv_unterwegs',
                      '#1E3A5F',
                      'sv_angekommen',
                      '#1E3A5F',
                      'rgba(69,115,162,1)',
                    ],
            'circle-radius': key === 'svs' ? 9 : 7,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        })

        // Klick auf einzelnen Pin
        map.on('click', LAYER_POINT[key], (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const id = feature.properties?.__id as string
          const type = feature.properties?.__pinType as LayerKey
          const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
          openPopup(map, coords, type, id)
        })

        // Klick auf Cluster → reinzoomen
        map.on('click', LAYER_CLUSTER[key], (e: MapMouseEvent & { features?: MapboxGeoJSONFeature[] }) => {
          const feature = e.features?.[0]
          if (!feature) return
          const clusterId = feature.properties?.cluster_id as number
          const source = map.getSource(SRC[key]) as GeoJSONSource
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err || typeof zoom !== 'number') return
            const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]
            map.easeTo({ center: coords, zoom })
          })
        })

        // Hover-Cursor
        map.on('mouseenter', LAYER_POINT[key], () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LAYER_POINT[key], () => {
          map.getCanvas().style.cursor = ''
        })
        map.on('mouseenter', LAYER_CLUSTER[key], () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', LAYER_CLUSTER[key], () => {
          map.getCanvas().style.cursor = ''
        })
      })

      pushDataToMap(map, snapshotRef.current)
      if (!initialFitDoneRef.current) doFitBounds(map, snapshotRef.current)
    })

    mapRef.current = map
    return () => {
      popupRef.current?.remove()
      popupRootRef.current?.unmount()
      popupRootRef.current = null
      map.remove()
      mapRef.current = null
      initialFitDoneRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPopup])

  // Daten in Sources schreiben bei Snapshot-Änderung
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    pushDataToMap(map, snapshot)
  }, [snapshot])

  // Visibility-Toggle
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    ;(['leads', 'svs', 'termine'] as LayerKey[]).forEach((key) => {
      const vis = visibility[key] ? 'visible' : 'none'
      ;[LAYER_POINT[key], LAYER_CLUSTER[key], LAYER_CLUSTER_COUNT[key]].forEach((layerId) => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', vis)
      })
    })
  }, [visibility])

  const onToggle = useCallback((key: LayerKey) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Realtime
  const refetch = useCallback(async () => {
    const result = await refetchKarteSnapshot()
    if (result.ok) setSnapshot(result.data)
  }, [])
  useTriageRealtime(refetch)

  if (!tokenOk) {
    return (
      <div className="flex h-full items-center justify-center text-claimondo-navy">
        Mapbox-Token fehlt — Karte kann nicht initialisiert werden.
      </div>
    )
  }

  const counts: Record<LayerKey, number> = {
    leads: snapshot.leads.length,
    svs: snapshot.svs.length,
    termine: snapshot.termine.length,
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <LayerChipBar visibility={visibility} counts={counts} onToggle={onToggle} />
      <UnlocalizedSidebar leads={snapshot.unlocalized} />
    </div>
  )
}

function pushDataToMap(map: MapboxMap, snapshot: KarteSnapshot) {
  const srcLeads = map.getSource(SRC.leads) as GeoJSONSource | undefined
  const srcSvs = map.getSource(SRC.svs) as GeoJSONSource | undefined
  const srcTermine = map.getSource(SRC.termine) as GeoJSONSource | undefined
  srcLeads?.setData(leadsToGeoJSON(snapshot.leads))
  srcSvs?.setData(svsToGeoJSON(snapshot.svs))
  srcTermine?.setData(termineToGeoJSON(snapshot.termine))
}

function doFitBounds(map: MapboxMap, snapshot: KarteSnapshot) {
  const all = [...snapshot.leads, ...snapshot.svs, ...snapshot.termine]
  if (all.length === 0) return
  const bounds = new mapboxgl.LngLatBounds()
  all.forEach((p) => bounds.extend([p.lng, p.lat]))
  map.fitBounds(bounds, { padding: 80, maxZoom: 10, duration: 0 })
}
