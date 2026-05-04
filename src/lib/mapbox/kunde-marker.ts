'use client'

// AAR-380: Custom Kunden-Marker (für symmetrisches Tracking, AAR-378/384).
// Optisch kleiner als SV-Marker, ohne Pulse-Ring, in Ondo-Blue statt Navy.

import { mapboxgl } from './client'
import type { Map as MapboxMap } from 'mapbox-gl'

export interface KundeMarkerOptions {
  initials?: string
}

function buildKundeMarkerElement(opts: KundeMarkerOptions): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'kunde-marker'
  // AAR-marker-instant: keine CSS-transition — Pin sitzt fest an der
  // Mapbox-Marker-Position. Der Active-Stop-Highlight (scale 1.5 +
  // box-shadow) wechselt damit hart, was visuell klarer ist als ein
  // sanftes „Nachgleiten".
  el.style.cssText = [
    'width: 24px',
    'height: 24px',
    'border-radius: 9999px',
    'background: #4573A2',
    'border: 2px solid #FFFFFF',
    'box-shadow: 0 2px 6px rgba(13,27,62,0.35)',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'color: #FFFFFF',
    'font-weight: 700',
    'font-size: 10px',
    'pointer-events: none',
  ].join(';')
  el.textContent = (opts.initials ?? 'K').slice(0, 2).toUpperCase()
  return el
}

export function addKundeMarker(
  map: MapboxMap,
  lngLat: [number, number],
  options: KundeMarkerOptions = {},
): mapboxgl.Marker {
  const el = buildKundeMarkerElement(options)
  return new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat(lngLat)
    .addTo(map)
}
