'use client'

// AAR-380: Custom SV-Marker mit Avatar + Pulse-Ring für den Fokus-Modus.
//
// Rendert einen HTMLDivElement als mapboxgl.Marker. Der Content wird
// imperativ gesetzt (keine React-Integration hier — das macht AAR-382
// per Portal bei Bedarf). Die Lib liefert nur das DOM-Element.

import { mapboxgl } from './client'
import type { Map as MapboxMap } from 'mapbox-gl'

export interface SvMarkerOptions {
  avatarUrl?: string | null
  initials?: string
  heading?: number | null // Grad, 0=Norden
}

/** Baut das DOM-Element für den SV-Marker. */
function buildMarkerElement(opts: SvMarkerOptions): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'sv-avatar-marker'
  wrapper.style.cssText = [
    'position: relative',
    'width: 48px',
    'height: 48px',
    'pointer-events: none',
  ].join(';')

  // Pulsierender Ring
  const ring = document.createElement('div')
  ring.style.cssText = [
    'position: absolute',
    'inset: -6px',
    'border-radius: 9999px',
    'background: rgba(69, 115, 162, 0.35)',
    'animation: sv-marker-pulse 1.8s ease-out infinite',
  ].join(';')
  wrapper.appendChild(ring)

  // Avatar-Kreis
  const avatar = document.createElement('div')
  avatar.style.cssText = [
    'position: absolute',
    'inset: 0',
    'border-radius: 9999px',
    'background: #0D1B3E',
    'border: 3px solid #FFFFFF',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.3)',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'color: #FFFFFF',
    'font-weight: 600',
    'font-size: 14px',
    'overflow: hidden',
    opts.heading != null ? `transform: rotate(${opts.heading}deg)` : '',
  ]
    .filter(Boolean)
    .join(';')

  if (opts.avatarUrl) {
    const img = document.createElement('img')
    img.src = opts.avatarUrl
    img.alt = ''
    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover'
    avatar.appendChild(img)
  } else {
    avatar.textContent = (opts.initials ?? 'SV').slice(0, 2).toUpperCase()
  }

  wrapper.appendChild(avatar)
  return wrapper
}

/**
 * CSS-Keyframes für die Pulse-Animation. Muss einmalig ins <head>
 * injiziert werden (idempotent).
 */
function ensurePulseKeyframes(): void {
  const id = 'sv-marker-pulse-keyframes'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    @keyframes sv-marker-pulse {
      0% { transform: scale(1); opacity: 0.7; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  `
  document.head.appendChild(style)
}

/**
 * Erzeugt einen SV-Avatar-Marker und fügt ihn zur Karte hinzu.
 * Returns die mapboxgl.Marker-Instanz für Updates / Remove.
 */
export function addSvAvatarMarker(
  map: MapboxMap,
  lngLat: [number, number],
  options: SvMarkerOptions = {},
): mapboxgl.Marker {
  ensurePulseKeyframes()
  const el = buildMarkerElement(options)
  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat(lngLat)
    .addTo(map)
  return marker
}
