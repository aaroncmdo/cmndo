'use client'

import { useEffect, useRef } from 'react'
import { CLUSTER, cityHref, type City } from '@/lib/cluster'

// CLIENT-Sub-Komponente der EinsatzgebietSection. Leaflet 1.9.4 wird per CDN
// LAZY geladen (IntersectionObserver auf dem Map-Container) — kein npm-Dep,
// keine Bundle-Last bevor die Karte sichtbar ist.
// Phase 3 #7: initialisiert BEIDE Karten — #clusterMap (Desktop, von dieser
// Komponente gerendert) + #clusterMapMobile (in der sm:hidden-Insel der
// EinsatzgebietSection). Pro Container ein eigener Observer + Map-Instance;
// nur der jeweils SICHTBARE Container intersected -> nur er initialisiert
// (display:none-Container feuern nie). Robust gegen Doppel-Init (per-id-Guard)
// + StrictMode-Double-Mount. Cleanup via map.remove() fuer alle Instanzen.

interface LeafletMap {
  remove(): void
}
interface LeafletStatic {
  map(el: HTMLElement, opts?: Record<string, unknown>): {
    setView(center: [number, number], zoom: number): unknown
    remove(): void
    invalidateSize(): void
  }
  tileLayer(url: string, opts: Record<string, unknown>): { addTo(m: unknown): unknown }
  circleMarker(latlng: [number, number], opts: Record<string, unknown>): {
    addTo(m: unknown): { bindTooltip(text: string): unknown; bindPopup(html: string, opts?: Record<string, unknown>): unknown }
  }
  marker(latlng: [number, number], opts: Record<string, unknown>): {
    addTo(m: unknown): { bindTooltip(text: string): unknown; bindPopup(html: string, opts?: Record<string, unknown>): unknown }
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
const MAP_IDS = ['clusterMap', 'clusterMapMobile'] as const

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

// Mini-Vorschau-Popup fuer Stadt-Pins (AAR-966): Titel + Tagline + Link zur
// Spoke-Seite. Navigation bleibt im Hub (interne /lp/[slug]-Route). CSS-Vars
// (--petrol/--amber) sind global im :root verfuegbar (Popup haengt im document).
function spokePopupHtml(c: City): string {
  const href = cityHref(c)
  const label = c.main ? 'Zur Übersicht' : 'Zur Seite'
  return (
    '<div style="min-width:158px;font-family:var(--font-display),system-ui,sans-serif">' +
    `<strong style="display:block;font-size:13.5px;color:var(--petrol);line-height:1.25">Kfz-Gutachter ${c.name}</strong>` +
    `<span style="display:block;font-size:11px;color:#5F6E74;margin-top:3px;line-height:1.3">${c.h1Sub ?? ''}</span>` +
    `<a href="${href}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:var(--amber);text-decoration:none">${label} →</a>` +
    '</div>'
  )
}

export function MapSection({ city }: { city: City }) {
  const mapsRef = useRef<Record<string, LeafletMap>>({})
  const initedRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    const observers: IntersectionObserver[] = []

    function initMap(L: LeafletStatic, id: string) {
      if (cancelled || initedRef.current[id]) return
      const el = document.getElementById(id)
      if (!el) return
      initedRef.current[id] = true

      const map = L.map(el, { scrollWheelZoom: false, attributionControl: true })
      map.setView([city.lat, city.lng], 10)
      mapsRef.current[id] = map as unknown as LeafletMap
      el.setAttribute('data-leaflet-init', '1') // entfernt das Mobile-Skeleton (.einsatz-map)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      // Stadt-Marker: aktive Stadt = Cluster-Akzent, andere = Cluster-Primaer.
      // BRIEF 08d/K1: Leaflet loest var() nicht auf -> Tokens zur Laufzeit lesen.
      const rootStyle = getComputedStyle(document.documentElement)
      const markerAccent = rootStyle.getPropertyValue('--amber').trim() || '#D32E20'
      const markerPrimary = rootStyle.getPropertyValue('--petrol').trim() || '#2A2E33'
      for (const c of CLUSTER.cities) {
        const isActive = c.slug === city.slug
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: isActive ? 9 : 6,
          color: '#ffffff',
          weight: 2,
          fillColor: isActive ? markerAccent : markerPrimary,
          fillOpacity: 1,
        }).addTo(map)
        marker.bindTooltip(c.name)
        // Klickbarer Pin -> Mini-Vorschau + Link zur Spoke-Seite (AAR-966).
        marker.bindPopup(spokePopupHtml(c), { closeButton: false })
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

      // Container in Card/Insel kann nach Init final-sizen -> Leaflet neu vermessen,
      // damit alle Tiles fuer die echte Groesse geladen werden.
      window.setTimeout(() => {
        if (!cancelled && mapsRef.current[id]) map.invalidateSize()
      }, 250)
    }

    for (const id of MAP_IDS) {
      const container = document.getElementById(id)
      if (!container) continue
      const observer = new IntersectionObserver(
        (entries, obs) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              obs.disconnect()
              ensureLeafletCss()
              loadLeafletJs()
                .then((L) => initMap(L, id))
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
      observers.push(observer)
    }

    return () => {
      cancelled = true
      observers.forEach((o) => o.disconnect())
      for (const id of Object.keys(mapsRef.current)) {
        mapsRef.current[id]?.remove()
      }
      mapsRef.current = {}
      initedRef.current = {}
    }
  }, [city])

  return (
    <div
      id="clusterMap"
      className="hidden sm:block w-full h-[400px] rounded-card border border-border bg-petrol-tint mb-4 relative"
      role="group"
      aria-label="Interaktive Karte des Einsatzgebiets mit Standorten"
      style={{ zIndex: 0, isolation: 'isolate' }}
    />
  )
}
