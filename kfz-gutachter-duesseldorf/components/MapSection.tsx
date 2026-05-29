'use client'

import { useEffect, useRef } from 'react'
import { CLUSTER, type City } from '@/lib/cluster'

// CLIENT-Sub-Komponente der EinsatzgebietSection. Leaflet 1.9.4 wird per CDN
// LAZY geladen (IntersectionObserver auf dem Map-Container) — kein npm-Dep,
// keine Bundle-Last bevor die Karte sichtbar ist. Robust gegen Doppel-Init
// (ref-guard) + React-StrictMode-Double-Mount. Cleanup via map.remove().

// minimaler Leaflet-Typ-Shim (kein @types/leaflet als Dep)
interface LeafletMap {
  remove(): void
}
interface LeafletStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): {
    setView(center: [number, number], zoom: number): unknown
    remove(): void
  }
  tileLayer(url: string, opts: Record<string, unknown>): { addTo(m: unknown): unknown }
  circleMarker(latlng: [number, number], opts: Record<string, unknown>): {
    addTo(m: unknown): { bindTooltip(text: string): unknown }
  }
  marker(latlng: [number, number], opts: Record<string, unknown>): {
    addTo(m: unknown): { bindTooltip(text: string): unknown }
  }
  divIcon(opts: Record<string, unknown>): unknown
}

declare global {
  interface Window {
    L?: LeafletStatic
  }
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

function ensureLeafletCss(): void {
  if (document.querySelector(`link[href="${LEAFLET_CSS}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = LEAFLET_CSS
  document.head.appendChild(link)
}

function loadLeafletJs(): Promise<LeafletStatic> {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L)
      return
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => window.L && resolve(window.L))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.addEventListener('load', () => (window.L ? resolve(window.L) : reject(new Error('Leaflet load failed'))))
    script.addEventListener('error', reject)
    document.head.appendChild(script)
  })
}

export function MapSection({ city }: { city: City }) {
  const mapRef = useRef<LeafletMap | null>(null)
  const initedRef = useRef(false)

  useEffect(() => {
    const container = document.getElementById('clusterMap')
    if (!container) return

    let cancelled = false

    function initMap(L: LeafletStatic) {
      if (cancelled || initedRef.current) return
      const el = document.getElementById('clusterMap')
      if (!el) return
      initedRef.current = true

      const map = L.map(el, { scrollWheelZoom: false, attributionControl: true })
      map.setView([city.lat, city.lng], 10)
      mapRef.current = map as unknown as LeafletMap

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      // Stadt-Marker: aktive Stadt = amber, andere = petrol Circle-Marker
      for (const c of CLUSTER.cities) {
        const isActive = c.slug === city.slug
        L.circleMarker([c.lat, c.lng], {
          radius: isActive ? 9 : 6,
          color: '#ffffff',
          weight: 2,
          // Literal-Hex (= --amber / --petrol aus globals.css): Leaflet setzt
          // fillColor als SVG-Praesentations-Attribut, das loest CSS var() NICHT auf.
          fillColor: isActive ? '#D32E20' : '#2A2E33',
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip(c.name)
      }

      // Brennpunkte als rote Diamanten (nur Hauptstadt-Level — nahe city)
      if (city.main) {
        const offsets: [number, number][] = [
          [0.012, 0.018],
          [-0.014, 0.01],
          [0.008, -0.02],
        ]
        CLUSTER.brennpunkte.forEach((b, i) => {
          const off = offsets[i] ?? [0, 0]
          const icon = L.divIcon({
            className: '',
            html:
              '<div style="width:12px;height:12px;background:#ef4444;border:2px solid #fff;transform:rotate(45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          })
          L.marker([city.lat + off[0], city.lng + off[1]], { icon })
            .addTo(map)
            .bindTooltip(b.name)
        })
      }
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            obs.disconnect()
            ensureLeafletCss()
            loadLeafletJs()
              .then((L) => initMap(L))
              .catch(() => {
                /* Karte ist progressive enhancement — Fehler darf UX nicht brechen */
              })
            break
          }
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(container)

    return () => {
      cancelled = true
      observer.disconnect()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      initedRef.current = false
    }
  }, [city])

  return (
    <div
      id="clusterMap"
      className="w-full h-[400px] rounded-card border border-border bg-petrol-tint mb-4 relative"
      role="group"
      aria-label="Interaktive Karte des Einsatzgebiets mit Standorten"
      style={{ zIndex: 0, isolation: 'isolate' }}
    />
  )
}
