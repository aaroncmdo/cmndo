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

// ─── Auto-Skin-Marker (Top-Down PKW) ───────────────────────────────────────

export interface SvCarMarkerOptions {
  /** Heading 0=Norden, 90=Osten — rotiert das Auto entsprechend. */
  heading?: number | null
  /** Karosseriefarbe (hex). Default Claimondo-Navy. */
  bodyColor?: string
}

/**
 * Top-Down-PKW-SVG als Mapbox-Marker. Inklusive Schatten + Scheinwerfer +
 * Rückleuchten + Glas-Tönung. Größe: 40×64 px.
 */
function buildCarMarkerElement(opts: SvCarMarkerOptions): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'sv-car-marker'
  wrapper.style.cssText = [
    'position: relative',
    'width: 40px',
    'height: 64px',
    'pointer-events: none',
    'transition: transform 0.3s ease-out',
    opts.heading != null ? `transform: rotate(${opts.heading}deg)` : '',
  ]
    .filter(Boolean)
    .join(';')

  const body = opts.bodyColor ?? '#0D1B3E'
  wrapper.innerHTML = `
    <svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg" width="40" height="64">
      <defs>
        <filter id="car-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/>
          <feOffset dx="0" dy="3" result="offsetblur"/>
          <feFlood flood-color="rgba(0,0,0,0.45)"/>
          <feComposite in2="offsetblur" operator="in"/>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#car-shadow)">
        <!-- Karosserie -->
        <rect x="6" y="5" width="28" height="54" rx="9" fill="${body}" stroke="rgba(255,255,255,0.95)" stroke-width="1.5"/>
        <!-- Frontscheibe -->
        <path d="M9 14 L14 9 L26 9 L31 14 L31 24 L9 24 Z" fill="#7BA3CC" opacity="0.85"/>
        <!-- Heckscheibe -->
        <rect x="9" y="36" width="22" height="11" rx="2" fill="#7BA3CC" opacity="0.85"/>
        <!-- Mittel-Trennung (Türen) -->
        <line x1="20" y1="24" x2="20" y2="36" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/>
        <line x1="9" y1="30" x2="31" y2="30" stroke="rgba(255,255,255,0.18)" stroke-width="0.6"/>
        <!-- Scheinwerfer vorne -->
        <rect x="9" y="6" width="6" height="2.5" rx="1" fill="#FFEEAA"/>
        <rect x="25" y="6" width="6" height="2.5" rx="1" fill="#FFEEAA"/>
        <!-- Rückleuchten -->
        <rect x="9" y="55" width="6" height="2.5" rx="1" fill="#FF6B6B"/>
        <rect x="25" y="55" width="6" height="2.5" rx="1" fill="#FF6B6B"/>
      </g>
    </svg>
  `
  return wrapper
}

/**
 * Auto-Skin-Marker als SV-Position. Rotiert mit `heading`.
 * Bevorzugte Variante für die Tagesroute-Karte.
 */
export function addSvCarMarker(
  map: MapboxMap,
  lngLat: [number, number],
  options: SvCarMarkerOptions = {},
): mapboxgl.Marker {
  const el = buildCarMarkerElement(options)
  return new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat(lngLat)
    .addTo(map)
}
