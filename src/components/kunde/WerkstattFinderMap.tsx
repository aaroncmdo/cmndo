// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings fuer Marker-Fills.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

// SP-C2 — Werkstatt-Finder-Karte (Kunde-Portal). Mapbox-Karte auf den Schadenort
// mit Partner-Werkstatt-Pins + der bestehenden WerkstattFinder-Liste darunter.
// Klick auf einen Pin hebt die Werkstatt in der Liste hervor (Ring); die Auswahl
// bestaetigt der Kunde ueber den "Auswaehlen"-Button der Liste. Gespiegelt aus
// KundeLiveMap (kunde-portal-erprobtes Mapbox-Pattern) — NICHT die hot FinderMap.
// Ohne Geo (kein Schadenort + keine Werkstatt-Koordinaten) faellt es auf die
// reine Liste zurueck.

import { useEffect, useRef, useState } from 'react'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import { ensureMapboxInitialized, mapboxgl, MAPBOX_STYLE_STANDARD } from '@/lib/mapbox'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'

type LatLng = { lat: number; lng: number }

type Props = {
  werkstaetten: WerkstattFinderRow[]
  center: LatLng | null
  onSelect: (id: string) => void
  selectedId?: string | null
  loading?: boolean
  keineSpezialisierte?: boolean
}

function firstGeo(rows: WerkstattFinderRow[]): LatLng | null {
  const r = rows.find((w) => w.lat != null && w.lng != null)
  return r && r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null
}

export function WerkstattFinderMap({ werkstaetten, center, onSelect, selectedId, loading, keineSpezialisierte }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<MapboxMarker[]>([])
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const hatGeo = center != null || werkstaetten.some((w) => w.lat != null && w.lng != null)

  // Karte initialisieren (einmal, sobald Geo vorhanden).
  useEffect(() => {
    if (!hatGeo || !containerRef.current || mapRef.current) return
    if (!ensureMapboxInitialized()) return
    const start = center ?? firstGeo(werkstaetten) ?? { lat: 51.2, lng: 6.8 } // NRW-Default
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE_STANDARD,
      center: [start.lng, start.lat],
      zoom: 11,
      attributionControl: true,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hatGeo])

  // Werkstatt-Pins (neu bei jeder Listen-Aenderung) + fitBounds.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      const bounds = new mapboxgl.LngLatBounds()
      if (center) bounds.extend([center.lng, center.lat])
      werkstaetten.forEach((w, i) => {
        if (w.lat == null || w.lng == null) return
        const el = document.createElement('div')
        el.style.cssText = [
          'width: 30px',
          'height: 30px',
          'border-radius: 9999px',
          'background: #0D1B3E',
          'border: 3px solid #FFFFFF',
          'box-shadow: 0 3px 8px rgba(0,0,0,0.3)',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'color: #FFFFFF',
          'font-weight: 700',
          'font-size: 12px',
          'cursor: pointer',
        ].join(';')
        el.textContent = String(i + 1)
        el.addEventListener('click', () => setHighlightId(w.id))
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([w.lng, w.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(w.name))
          .addTo(map)
        markersRef.current.push(marker)
        bounds.extend([w.lng, w.lat])
      })
      if (!bounds.isEmpty()) {
        try {
          map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 })
        } catch {
          /* fitBounds kann bei einem einzelnen Punkt werfen — ignorierbar */
        }
      }
    }
    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [werkstaetten, center])

  return (
    <div className="space-y-4">
      {hatGeo && (
        <div
          ref={containerRef}
          className="w-full rounded-ios-md overflow-hidden"
          style={{ height: '46vh', minHeight: 260 }}
        />
      )}
      <WerkstattFinder
        werkstaetten={werkstaetten}
        onSelect={onSelect}
        selectedId={selectedId ?? highlightId}
        loading={loading}
        keineSpezialisierte={keineSpezialisierte}
      />
    </div>
  )
}
