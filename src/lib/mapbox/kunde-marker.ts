'use client'

// AAR-380: Custom Kunden-Marker (für symmetrisches Tracking, AAR-378/384).
// Optisch kleiner als SV-Marker, ohne Pulse-Ring, in Ondo-Blue statt Navy.

import { mapboxgl } from './client'
import type { Map as MapboxMap } from 'mapbox-gl'

export interface KundeMarkerOptions {
  initials?: string
  /**
   * 2026-05-06: Optionale Status-Farbe für Map-Pins.
   *   bestaetigt    → emerald (#16a34a)
   *   reserviert    → amber (#f59e0b)
   *   verlegung_pending → amber-darker (#d97706)
   *   default       → ondo (#4573A2)
   */
  status?: 'bestaetigt' | 'reserviert' | 'verlegung_pending' | 'verlegt' | 'privat' | string
}

function colorForStatus(status?: string): string {
  switch (status) {
    case 'bestaetigt':
      return '#16a34a' // emerald-600
    case 'reserviert':
      return '#f59e0b' // amber-500
    case 'verlegung_pending':
      return '#d97706' // amber-600 darker
    case 'verlegt':
      return '#94a3b8' // slate-400 dimmed
    case 'privat':
      return '#7c3aed' // AAR-872: violet-600 — Privat-Stop visuell distinct
    default:
      return '#4573A2' // claimondo-ondo
  }
}

function buildKundeMarkerElement(opts: KundeMarkerOptions): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'kunde-marker'
  const bg = colorForStatus(opts.status)
  // Verlegte/abgelehnte/abgeschlossene Stops sind nicht Teil der heutigen
  // Route — visuell zurückdimmen damit der SV sie auf einen Blick als
  // „kein Stop heute" liest.
  const istInaktiv =
    opts.status === 'verlegt' ||
    opts.status === 'verlegung_pending' ||
    opts.status === 'abgelehnt' ||
    opts.status === 'abgeschlossen'
  el.style.cssText = [
    'width: 24px',
    'height: 24px',
    'border-radius: 9999px',
    `background: ${bg}`,
    'border: 2px solid #FFFFFF',
    'box-shadow: 0 2px 6px rgba(13,27,62,0.35)',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'color: #FFFFFF',
    'font-weight: 700',
    'font-size: 10px',
    'pointer-events: none',
    `opacity: ${istInaktiv ? '0.4' : '1'}`,
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
