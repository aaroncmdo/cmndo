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
import type { Map as MapboxMap, Marker as MapboxMarker, GeoJSONSource, Popup as MapboxPopup } from 'mapbox-gl'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { fetchDrivingRoute } from '@/lib/mapbox/directions'
import { addPulsingFlow, type PulsingFlowHandle } from '@/lib/mapbox/pulsing-route'
import { createRoot, type Root } from 'react-dom/client'
import { WerkstattProfilePopup } from './WerkstattProfilePopup'
import { WerkstattProfileSheet } from './WerkstattProfileSheet'

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
  const routePulseRef = useRef<PulsingFlowHandle | null>(null)
  const popupRef = useRef<MapboxPopup | null>(null)
  const popupRootRef = useRef<Root | null>(null)
  const selectedIdRef = useRef<string | null>(selectedId)
  // Zuletzt auf die Route gerahmte Auswahl — damit fitBounds NUR bei Auswahl-Wechsel feuert
  // (nicht bei Re-Draw wegen rows/center) und Deselect wieder freigibt (Re-Select rahmt erneut).
  const lastFramedRef = useRef<string | null>(null)
  const [sheetOffen, setSheetOffen] = useState(true)
  const dragStartRef = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  // Mobil (<lg): geklicktes Werkstatt-Profil als Bottom-Sheet (statt engem Map-Popup).
  const [sheetWerkstatt, setSheetWerkstatt] = useState<WerkstattVorschlag | null>(null)

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
      popupRootRef.current?.unmount()
      popupRef.current?.remove()
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
    // Map-Pin-Profil (statt nacktem Namen) — createRoot/setDOMContent-Muster wie FinderMap.openSvPopup.
    // AAR-956-Muster (FinderMap.popupPlatzierung): Popup in den freien Raum oeffnen, Pin frei lassen —
    // Pin hinter der Desktop-Wizard-Spalte (links) -> nach RECHTS; nah am oberen Rand -> nach UNTEN;
    // sonst nach OBEN. Verhindert Wizard-Overlap + oberes Clipping (auf Mobil greift nur top/bottom).
    const popupPlatzierung = (lng: number, lat: number): { anchor: 'left' | 'top' | 'bottom'; offset: [number, number] } => {
      const p = map.project([lng, lat])
      const desktop = typeof window !== 'undefined' && window.innerWidth >= 1024
      if (desktop && p.x < 640) return { anchor: 'left', offset: [26, -6] }
      if (p.y < 300) return { anchor: 'top', offset: [0, 16] }
      return { anchor: 'bottom', offset: [0, -46] }
    }
    const openWerkstattPopup = (w: WerkstattVorschlag) => {
      if (w.lat == null || w.lng == null) return
      // Mobil/iPad (<lg): Profil als Bottom-Sheet statt engem Map-Popup (Pin liegt teils unter dem
      // Wizard-Sheet + Popup ragt aus dem Screen) — Muster wie FinderMap.openSvPopup (SV, AAR-956).
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setSheetWerkstatt(w)
        return
      }
      popupRef.current?.remove()
      popupRootRef.current?.unmount()
      const container = document.createElement('div')
      const root = createRoot(container)
      root.render(<WerkstattProfilePopup w={w} />)
      const { anchor, offset } = popupPlatzierung(w.lng, w.lat)
      const popup = new mapboxgl.Popup({ offset, closeButton: true, maxWidth: '330px', anchor, className: 'wf-finder-popup' })
        .setLngLat([w.lng, w.lat])
        .setDOMContent(container)
        .addTo(map)
      popup.on('close', () => {
        root.unmount()
        if (popupRef.current === popup) popupRef.current = null
        if (popupRootRef.current === root) popupRootRef.current = null
      })
      popupRef.current = popup
      popupRootRef.current = root
    }
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
        el.addEventListener('click', (e) => {
          // stopPropagation: sonst bubbelt der Klick zum Map-Container, Mapbox feuert map-'click'
          // und schliesst das eben geoeffnete Popup sofort wieder (closeOnClick Default true) ->
          // Popup flackert auf+zu, Kunde sieht nie das Profil. Exakt wie FinderMap.openSvPopup (SV).
          // Prod-Smoke #4695 (MutationObserver): ADD wf-finder-popup ... REMOVE -> finalPopups=0.
          e.stopPropagation()
          onSelectPin(w.id)
          openWerkstattPopup(w)
        })
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([w.lng, w.lat])
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

  // Aaron 17.07.: Route zur AUSGEWÄHLTEN Werkstatt + gerichteter Puls VOM Kunden ZUR Werkstatt
  // (direction:'forward' — die Geometrie ist center→Werkstatt geordnet). Kein fitBounds/Kamera-
  // Move (respektiert die I4-Regel: Auswahl bewegt die Karte nicht). fetchDrivingRoute hat einen
  // Luftlinien-Fallback → die Route erscheint auch ohne Directions-Quote.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const ziel = selectedId ? rows.find((r) => r.id === selectedId) : null

    const removeRoute = () => {
      routePulseRef.current?.remove()
      routePulseRef.current = null
      for (const id of ['wf-route-line', 'wf-route-casing']) {
        if (map.getLayer(id)) {
          try {
            map.removeLayer(id)
          } catch {
            /* schon weg */
          }
        }
      }
      if (map.getSource('wf-route')) {
        try {
          map.removeSource('wf-route')
        } catch {
          /* schon weg */
        }
      }
    }

    if (!ziel || ziel.lat == null || ziel.lng == null || !center) {
      removeRoute()
      lastFramedRef.current = null // Deselect gibt frei → Re-Select derselben Werkstatt rahmt erneut
      return
    }

    let cancelled = false
    const ctrl = new AbortController()
    const zielLng = ziel.lng
    const zielLat = ziel.lat

    const draw = () => {
      void fetchDrivingRoute([center.lng, center.lat], [zielLng, zielLat], { signal: ctrl.signal }).then(({ primary }) => {
        if (cancelled || !mapRef.current) return
        const data: GeoJSON.Feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: primary.coords as Array<[number, number]> },
          properties: {},
        }
        const src = map.getSource('wf-route') as GeoJSONSource | undefined
        if (src) {
          src.setData(data)
        } else {
          // lineMetrics: true → Voraussetzung für den `line-gradient`-Puls (addPulsingFlow).
          map.addSource('wf-route', { type: 'geojson', lineMetrics: true, data })
          // Weiße Casing zuerst (darunter) → die Route hebt sich prägnant von der Karte ab.
          map.addLayer({
            id: 'wf-route-casing',
            type: 'line',
            source: 'wf-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 },
          })
          map.addLayer({
            id: 'wf-route-line',
            type: 'line',
            source: 'wf-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': COL_ONDO,
              'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 6, 16, 8],
              'line-opacity': 0.95,
            },
          })
        }
        // Gerichteter heller Puls OBEN — fließt Kunde → Werkstatt.
        routePulseRef.current?.remove()
        routePulseRef.current = addPulsingFlow(map, {
          sourceId: 'wf-route',
          layerId: 'wf-route-pulse',
          color: '#ffffff',
          direction: 'forward',
          width: ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 5],
        })
        // Kamera EINMALIG auf die Route rahmen, wenn sich die AUSWAHL geaendert hat (nicht bei
        // Re-Draw wegen rows/center) — sonst liegt die kurze Route unsichtbar hinter Popup/Sheet
        // (Aaron 29.07.: Pin-Klick zeigte "keine Route"). Analog Gutachter-Finder (routeToTarget):
        // Padding links = Wizard-Glass-Spalte (Desktop, clamp 440..620px) bzw. unten = Bottom-Sheet
        // (Mobil), damit die Route frei sichtbar bleibt statt verdeckt.
        if (lastFramedRef.current !== selectedId) {
          lastFramedRef.current = selectedId
          const desktop = typeof window !== 'undefined' && window.innerWidth >= 1024
          const leftPad = desktop ? Math.min(620, Math.max(440, window.innerWidth * 0.33)) + 28 : 40
          const bounds = new mapboxgl.LngLatBounds(
            [center.lng, center.lat],
            [center.lng, center.lat],
          ).extend([zielLng, zielLat])
          map.fitBounds(bounds, {
            padding: { top: 80, right: 70, bottom: desktop ? 90 : 380, left: leftPad },
            duration: 1200,
            maxZoom: 14,
          })
        }
      })
    }

    if (map.loaded()) draw()
    else map.once('load', draw)

    // Deps-Wechsel/Unmount: Fetch abbrechen + Puls-rAF stoppen. Source/Layer bleiben bei
    // Auswahl-Wechsel bestehen (nächster Lauf macht setData → kein Flicker); Voll-Abbau nur
    // beim Deselect (oben removeRoute) bzw. via map.remove() beim Unmount.
    return () => {
      cancelled = true
      ctrl.abort()
      routePulseRef.current?.remove()
      routePulseRef.current = null
    }
  }, [selectedId, rows, center])

  return (
    <div className="relative w-full" style={{ height: '100dvh' }}>
      {/* wf-finder-popup: Mapbox-Popup transparent, damit die GlassSurface die Oberflaeche ist (wie sv-finder-popup). */}
      <style>{`
        .wf-finder-popup .mapboxgl-popup-content { background: transparent; padding: 0; box-shadow: none; }
        .wf-finder-popup .mapboxgl-popup-tip { display: none; }
        .wf-finder-popup.mapboxgl-popup { z-index: 12; }
        .wf-finder-popup .mapboxgl-popup-close-button {
          top: 10px; right: 10px; width: 24px; height: 24px; display: flex; align-items: center;
          justify-content: center; border-radius: 9999px; color: var(--claimondo-navy, #0D1B3E);
          font-size: 16px; line-height: 1; z-index: 3;
        }
      `}</style>
      {/* Karte full-bleed. position/inset MÜSSEN inline sein: mapbox-gl.css setzt .mapboxgl-map{position:relative}
          und würde eine .absolute-Utility überschreiben → Höhe kollabiert auf 0 (leerer Canvas, kein Fehler). */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, background: 'var(--brand-surface, #FFFFFF)' }} />

      {/* Mobil/iPad: geklicktes Werkstatt-Profil als Bottom-Sheet (statt engem Map-Popup) */}
      {sheetWerkstatt && <WerkstattProfileSheet w={sheetWerkstatt} onClose={() => setSheetWerkstatt(null)} />}

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
