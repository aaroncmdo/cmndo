// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings für Marker-Fills.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

// Werkstatt-Finder-Shell (Phase 2) — full-bleed Mapbox-Karte (Werkstatt-Pins + Fahrzeug-Anker) mit
// freischwebender Glass-Spalte (Desktop) bzw. ziehbarem Bottom-Sheet (Mobil), das den Wizard trägt.
// UI-Sprache analog gutachter-finder/FinderMap, aber ohne SV-Spezifika (Isochrone/Dead-Pins/Routing):
// die Pins SIND die dynamischen Suchergebnisse (rows), Zustand kommt als Props (kein DOM-Event-Bus).
// WICHTIG: mapboxgl aus '@/lib/mapbox/client' (nicht Barrel — THREE.js/Cesium-Bundle-Crash).
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

const COL_NAVY = '#0D1B3E'
const COL_ONDO = '#4573A2'
const DEFAULT_CENTER: [number, number] = [7.0, 51.0] // NRW
const DEFAULT_ZOOM = 8.5

function pinStyle(isSel: boolean): string {
  return [
    'width:30px',
    'height:30px',
    'border-radius:9999px',
    `background:${isSel ? COL_ONDO : COL_NAVY}`,
    'border:3px solid #fff',
    'box-shadow:0 3px 8px rgba(0,0,0,0.3)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'color:#fff',
    'font-weight:700',
    'font-size:12px',
    'cursor:pointer',
    isSel ? 'transform:scale(1.15)' : 'transform:scale(1)',
  ].join(';')
}

type Props = {
  rows: WerkstattVorschlag[]
  center: { lat: number; lng: number } | null
  selectedId: string | null
  onSelectPin: (id: string) => void
  wizardSlot: React.ReactNode
}

export function WerkstattFinderShell({ rows, center, selectedId, onSelectPin, wizardSlot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<Array<{ id: string; el: HTMLDivElement; marker: MapboxMarker }>>([])
  const ankerRef = useRef<MapboxMarker | null>(null)
  const selectedIdRef = useRef<string | null>(selectedId)
  const [sheetOffen, setSheetOffen] = useState(true)
  const dragStartRef = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Karte einmalig initialisieren.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!ensureMapboxInitialized()) {
      console.error('[werkstatt-finder] Mapbox-Init fehlgeschlagen — NEXT_PUBLIC_MAPBOX_TOKEN fehlt')
      return
    }
    const start: [number, number] = center ? [center.lng, center.lat] : DEFAULT_CENTER
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      language: 'de',
      center: start,
      zoom: center ? 11 : DEFAULT_ZOOM,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // I4 (Review): Marker neu bauen + fitBounds NUR bei rows/center — NICHT bei selectedId
  // (sonst re-framet ein Pin-/Listen-Klick die ganze Karte). Farbe initial aus selectedIdRef.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      markersRef.current.forEach((e) => e.marker.remove())
      markersRef.current = []
      const bounds = new mapboxgl.LngLatBounds()
      if (center) bounds.extend([center.lng, center.lat])
      rows.forEach((w, i) => {
        if (w.lat == null || w.lng == null) return
        const el = document.createElement('div')
        el.style.cssText = pinStyle(w.id === selectedIdRef.current)
        el.textContent = String(i + 1)
        el.addEventListener('click', () => onSelectPin(w.id))
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([w.lng, w.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(w.name))
          .addTo(map)
        markersRef.current.push({ id: w.id, el, marker })
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
  }, [rows, center, onSelectPin])

  // I4: Auswahl-Highlight OHNE Kamera-Bewegung — restylt nur die vorhandenen Marker-Elemente.
  useEffect(() => {
    selectedIdRef.current = selectedId
    markersRef.current.forEach((e) => {
      e.el.style.cssText = pinStyle(e.id === selectedId)
    })
  }, [selectedId])

  // Fahrzeug-Anker-Pin auf center.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !center) return
    ankerRef.current?.remove()
    const el = document.createElement('div')
    el.setAttribute('aria-label', 'Fahrzeug-Standort')
    el.innerHTML = `<div style="width:18px;height:18px;border-radius:50%;background:${COL_NAVY};border:3px solid #fff;box-shadow:0 2px 6px rgba(13,27,62,0.35)"></div>`
    ankerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(map)
    map.flyTo({ center: [center.lng, center.lat], zoom: 12, duration: 800, essential: true })
  }, [center])

  return (
    <div className="relative w-full" style={{ height: '100dvh' }}>
      {/* Karte full-bleed. position/inset MÜSSEN inline sein: mapbox-gl.css setzt .mapboxgl-map{position:relative}
          und würde eine .absolute-Utility überschreiben → Höhe kollabiert auf 0 (leerer Canvas, kein Fehler). */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: 'var(--brand-surface, #FFFFFF)' }} />

      {/* Desktop: freischwebende Glass-Spalte mit dem Wizard */}
      <div
        className="hidden lg:flex flex-col absolute top-2 left-1 bottom-1 z-[10] overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{ width: 'clamp(440px, 33vw, 620px)', padding: 20, scrollbarWidth: 'none' }}
      >
        {wizardSlot}
      </div>

      {/* Mobil: ziehbares Bottom-Sheet mit dem Wizard (default ausgefahren; Chevron/Drag klappt ein) */}
      <div
        ref={sheetRef}
        className="lg:hidden absolute left-0 right-0 bottom-0 z-[10] transition-[transform] duration-500 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{
          transform: `${sheetOffen ? 'translateY(0)' : 'translateY(calc(100% - 56px))'} translateY(${dragY}px)`,
          transition: dragStartRef.current !== null ? 'none' : undefined,
        }}
      >
        <div
          className="rounded-t-[32px] border-x border-t border-white/50 bg-white/70 backdrop-blur-xl max-h-[85dvh] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
          style={{ boxShadow: '0 -14px 36px color-mix(in srgb, transparent 85%, var(--brand-primary, #0D1B3E))', scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => setSheetOffen((v) => !v)}
            onTouchStart={(e) => {
              dragStartRef.current = e.touches[0].clientY
            }}
            onTouchMove={(e) => {
              const start = dragStartRef.current
              if (start == null) return
              const dy = e.touches[0].clientY - start
              const maxDrag = Math.max(0, (sheetRef.current?.offsetHeight ?? 600) - 56)
              setDragY(sheetOffen ? Math.max(0, Math.min(dy, maxDrag)) : Math.min(0, Math.max(dy, -maxDrag)))
            }}
            onTouchEnd={(e) => {
              const start = dragStartRef.current
              dragStartRef.current = null
              setDragY(0)
              if (start == null) return
              e.preventDefault()
              const dy = e.changedTouches[0].clientY - start
              if (dy < -24) setSheetOffen(true)
              else if (dy > 24) setSheetOffen(false)
              else setSheetOffen((v) => !v)
            }}
            aria-label={sheetOffen ? 'Schließen' : 'Anfrage öffnen'}
            className="w-full px-5 pt-2.5 pb-1 flex items-center justify-center touch-none"
          >
            <ChevronUp
              className={`h-6 w-6 transition-transform duration-300 ${sheetOffen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--brand-secondary, #4573A2)' }}
            />
          </button>
          <div className="px-1 pb-6 pt-1 [&>div]:bg-transparent [&>div]:border-transparent [&>div]:shadow-none [&>div]:backdrop-blur-none">
            {wizardSlot}
          </div>
        </div>
      </div>
    </div>
  )
}
