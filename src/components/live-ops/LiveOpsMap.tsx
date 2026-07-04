// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings fuer marker fills + paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, MapMouseEvent, MapboxGeoJSONFeature, GeoJSONSource } from 'mapbox-gl'
import ErrorState from '@/components/shared/ErrorState'
import type { LiveOpsData } from './types'
import type { LiveOpsRole } from '@/lib/live-ops'
import { svPinsFC, isochroneFC } from './geo'
import { addSvCarMarker } from '@/lib/mapbox/sv-marker'
import SvPopup from './SvPopup'
import type { SvLiveOps } from '@/lib/live-ops'

// ------------------------------------------------------------------ Props

export interface LiveOpsMapProps {
  role: LiveOpsRole
  data: LiveOpsData
}

// ------------------------------------------------------------------ Layer-IDs

const SRC_SVS = 'lo-svs'
const SRC_ISOS = 'lo-isos'
const LAYER_SVS = 'lo-svs-circle'
const LAYER_ISOS_FILL = 'lo-isos-fill'
const LAYER_ISOS_LINE = 'lo-isos-line'

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

// ------------------------------------------------------------------ Component

export default function LiveOpsMap({ role, data }: LiveOpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // retryKey wird bei Retry inkrementiert → loest useEffect-Re-Mount aus
  const [retryKey, setRetryKey] = useState(0)

  // Hover-Sync (fuer Sidebar-Task 6)
  const [hoveredSvId, setHoveredSvId] = useState<string | null>(null)

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

  const handleRetry = useCallback(() => {
    setError(null)
    setReady(false)
    setRetryKey((k) => k + 1)
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

      root.render(<SvPopup sv={sv} role={role} />)

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: true })
        .setLngLat(lngLat)
        .setDOMContent(container)
        .addTo(map)

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
      style: 'mapbox://styles/mapbox/light-v11',
      center: [10.45, 51.16],
      zoom: 5.4,
      attributionControl: false,
    })

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false }),
      'top-right',
    )

    map.on('load', () => {
      if (!mountedRef.current) return

      // ─── Isochrone-Layer ───────────────────────────────────────────────
      map.addSource(SRC_ISOS, {
        type: 'geojson',
        data: isochroneFC(svsRef.current),
      })

      map.addLayer({
        id: LAYER_ISOS_FILL,
        type: 'fill',
        source: SRC_ISOS,
        paint: {
          'fill-color': TYP_COLOR_EXPR,
          'fill-opacity': 0.1,
        },
      })

      map.addLayer({
        id: LAYER_ISOS_LINE,
        type: 'line',
        source: SRC_ISOS,
        paint: {
          'line-color': TYP_COLOR_EXPR,
          'line-width': 1.5,
          'line-opacity': 0.5,
        },
      })

      // ─── SV-Pin-Layer ──────────────────────────────────────────────────
      map.addSource(SRC_SVS, {
        type: 'geojson',
        data: svPinsFC(svsRef.current),
      })

      map.addLayer({
        id: LAYER_SVS,
        type: 'circle',
        source: SRC_SVS,
        paint: {
          'circle-color': TYP_COLOR_EXPR,
          'circle-radius': 7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })

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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    // Source-Data updaten (kein doppeltes addSource/addLayer — guarde per getSource)
    if (map.getSource(SRC_SVS)) {
      (map.getSource(SRC_SVS) as GeoJSONSource).setData(svPinsFC(data.svs))
    }
    if (map.getSource(SRC_ISOS)) {
      (map.getSource(SRC_ISOS) as GeoJSONSource).setData(isochroneFC(data.svs))
    }

    // Car-Marker: alte entfernen, neue aufbauen
    clearCarMarkers()
    buildCarMarkers(map, data.svs)
  }, [data.svs, ready, clearCarMarkers, buildCarMarkers])

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

      {/* hoveredSvId wird in Task 6 von SidebarList konsumiert */}
      {/* data + role werden in Task 4+ fuer weitere Layer genutzt */}
    </div>
  )
}
