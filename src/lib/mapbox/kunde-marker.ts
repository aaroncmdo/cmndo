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
  el.style.cssText = [
    'width: 32px',
    'height: 32px',
    'border-radius: 9999px',
    'background: #4573A2',
    'border: 3px solid #FFFFFF',
    'box-shadow: 0 2px 8px rgba(0,0,0,0.25)',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'color: #FFFFFF',
    'font-weight: 600',
    'font-size: 11px',
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
