'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import type { TriageLeadPin, TriageSnapshot } from '@/lib/dispatch/karte/types'
import LeadPopup from './LeadPopup'
import UnlocalizedSidebar from './UnlocalizedSidebar'
import { useTriageRealtime } from './useTriageRealtime'
import { refetchTriageSnapshot } from './actions'

const DEFAULT_CENTER: [number, number] = [10.45, 51.16]
const DEFAULT_ZOOM = 5.4

function pinColor(pin: TriageLeadPin): string {
  // claimondo-shield (helles Navy) für PLZ-Centroid, claimondo-navy für exakte Geo
  return pin.geoSource === 'plz_centroid' ? '#7BA3CC' : '#0D1B3E'
}

export default function DispatchKarteClient({
  initialSnapshot,
}: {
  initialSnapshot: TriageSnapshot
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const popupRootsRef = useRef<Map<string, Root>>(new Map())
  const [snapshot, setSnapshot] = useState<TriageSnapshot>(initialSnapshot)
  const [tokenOk, setTokenOk] = useState<boolean>(true)
  const initialFitDoneRef = useRef(false)

  // Mount Mapbox einmal
  useEffect(() => {
    if (!containerRef.current) return
    const ok = ensureMapboxInitialized()
    setTokenOk(ok)
    if (!ok) return

    const styleUrl =
      process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL ||
      'mapbox://styles/mapbox/light-v11'

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    })
    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: false }),
      'top-right',
    )
    mapRef.current = map

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      popupRootsRef.current.forEach((r) => r.unmount())
      popupRootsRef.current.clear()
      map.remove()
      mapRef.current = null
      initialFitDoneRef.current = false
    }
  }, [])

  // Marker synchronisieren bei Snapshot-Änderung
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const nextIds = new Set(snapshot.pins.map((p) => p.id))

    // Pins entfernen die nicht mehr da sind
    markersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
        const root = popupRootsRef.current.get(id)
        if (root) {
          root.unmount()
          popupRootsRef.current.delete(id)
        }
      }
    })

    // Neue Pins hinzufügen, existierende Position aktualisieren
    for (const pin of snapshot.pins) {
      const existing = markersRef.current.get(pin.id)
      if (existing) {
        existing.setLngLat([pin.lng, pin.lat])
        continue
      }

      const el = document.createElement('div')
      el.style.width = '14px'
      el.style.height = '14px'
      el.style.borderRadius = '50%'
      el.style.background = pinColor(pin)
      el.style.border = '2px solid #ffffff'
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.25)'
      el.style.cursor = 'pointer'

      const popupContainer = document.createElement('div')
      const root = createRoot(popupContainer)
      root.render(<LeadPopup pin={pin} />)
      popupRootsRef.current.set(pin.id, root)

      const popup = new mapboxgl.Popup({
        offset: 16,
        closeButton: true,
        closeOnClick: true,
      }).setDOMContent(popupContainer)

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(popup)
        .addTo(map)

      markersRef.current.set(pin.id, marker)
    }

    // Initial fitBounds — nur einmal
    if (
      !initialFitDoneRef.current &&
      snapshot.pins.length > 0 &&
      mapRef.current
    ) {
      const bounds = new mapboxgl.LngLatBounds()
      snapshot.pins.forEach((p) => bounds.extend([p.lng, p.lat]))
      const doFit = () => {
        if (!mapRef.current) return
        mapRef.current.fitBounds(bounds, { padding: 64, maxZoom: 11, duration: 0 })
        initialFitDoneRef.current = true
      }
      if (mapRef.current.isStyleLoaded()) doFit()
      else mapRef.current.once('load', doFit)
    }
  }, [snapshot])

  // Realtime refetch
  const refetch = useCallback(async () => {
    const result = await refetchTriageSnapshot()
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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <UnlocalizedSidebar leads={snapshot.unlocalized} />
    </div>
  )
}
