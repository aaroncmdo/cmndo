'use client'

// 2026-05-11: Gutachter-Finder mit Mapbox-Vollbild-Karte (Referenz:
// docs/Pages/sv-live-mapbox_25.html) + DynamicWizard im Sidebar-Panel
// (Referenz: docs/Pages/terminierung-flow.html).
//
// Pattern:
//   - Map = Vollbild-Background mit 3D-Buildings, Pitch 35°
//   - Marker = Custom HTML pro sv_lead (Ondo-Border, Initial)
//   - Iso-Polygon = transparenter Halo (Ondo-Fill, 12% Opacity)
//   - Sidebar = Glass-Panel links mit DynamicWizard
//   - Click auf SV → highlight + scrollIntoView des Wizards
//   - Mobile = Bottom-Sheet statt Sidebar

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
// 2026-05-12: NICHT aus '@/lib/mapbox' (Index) importieren — der Index
// re-exportiert sv-car-3d-three (THREE.js am Top-Level) und cesium-3d-tiles,
// die sonst in den Public-Map-Bundle wandern. THREE.Color hat im minified
// Turbopack-Build den Constructor verloren → "i.Color is not a constructor"-
// Crash auf gutachter-finden. Direkter Import aus client.ts vermeidet das.
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, Marker, Popup } from 'mapbox-gl'
import { ChevronUp, Search, MapPin } from 'lucide-react'
import type { SvLead, AktiverSV } from '@/lib/actions/gutachter-finder-actions'

type Props = {
  /** Tier-3 Lead-Partner (sv_leads). Werden als kleine graue Marker
   * ohne Iso-Halo dargestellt — Fallback wenn kein Tier-1 die Region deckt. */
  svLeads: SvLead[]
  /** Tier-1 Pro/Premium-SVs mit Calendar-Sync. Werden mit Iso-Halo + Premium-
   * Marker dargestellt — die "richtigen" Partner. */
  aktiveSVs?: AktiverSV[]
  /** Server-Component-Rendered DynamicWizard fuer die Sidebar. */
  wizardSlot: React.ReactNode
}

// NRW-Mittelpunkt — gute Start-Ansicht da die 62 SVs hauptsaechlich in NRW
// liegen (Excel-Import vom 11.05.2026).
const DEFAULT_CENTER: [number, number] = [7.0, 51.0]
const DEFAULT_ZOOM = 8.5

// Marker-Color-Tokens (entsprechen den Claimondo-Brand-Variablen)
const COL_ONDO = '#4573A2'
const COL_NAVY = '#0D1B3E'

export function GutachterFinderMapClient({ svLeads, aktiveSVs = [], wizardSlot }: Props) {
  const mapRef = useRef<MapboxMap | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)

  // Sticky-Marker: wenn der User auf einen SV klickt, merken wir uns die ID
  // und scrollen die Wizard-Sidebar zum Anfang. Spaetere Iteration:
  // pre_selected_sv-Wert in den DynamicWizard schreiben.
  // (Aktuell reicht der Scroll, weil der Wizard sich Server-side rendert.)
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    ensureMapboxInitialized()
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 35,
      bearing: -8,
      antialias: true,
    })
    mapRef.current = map

    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()

    map.on('load', () => {
      // 3D-Buildings als sanfter Tiefe-Layer
      map.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'height'], [0, '#dcdfe7'], [40, '#c5cad6'], [120, '#a8aebd']],
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], [13, 0], [13.5, ['get', 'height']]],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], [13, 0], [13.5, ['get', 'min_height']]],
          'fill-extrusion-opacity': 0.6,
        },
      })

      // 2026-05-12 Plan v3 Backlog: Iso-Halos NUR fuer Tier-1 (echte SVs aus
      // sachverstaendige). Tier-3 (sv_leads) bleibt ohne Iso — zu viele Marker
      // sonst und Iso ist nicht echte Verfuegbarkeit, sondern Standard-25km.
      const tier1Features = aktiveSVs
        .filter((s) => s.isochrone_polygon && s.standort_lat != null && s.standort_lng != null)
        .map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, name: s.firmenname ?? '', tier: 'pro' },
          geometry: s.isochrone_polygon as GeoJSON.Polygon,
        }))

      if (tier1Features.length > 0) {
        map.addSource('sv-isos-pro', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: tier1Features },
        })

        // Tier-1 Halo: Ondo-Fill mit hoeherer Opacity als vorher
        map.addLayer({
          id: 'sv-isos-pro-fill',
          type: 'fill',
          source: 'sv-isos-pro',
          paint: {
            'fill-color': COL_ONDO,
            'fill-opacity': 0.12,
          },
        })

        map.addLayer({
          id: 'sv-isos-pro-outline',
          type: 'line',
          source: 'sv-isos-pro',
          paint: {
            'line-color': COL_ONDO,
            'line-width': 2,
            'line-opacity': 0.55,
          },
        })
      }

      // ─── Tier-1 Marker (echte SVs) — Premium-Look ──────────────────
      aktiveSVs.forEach((sv) => {
        if (sv.standort_lat == null || sv.standort_lng == null) return
        const name = sv.firmenname ?? ''
        const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'SV'
        const el = document.createElement('div')
        el.style.cursor = 'pointer'
        // Premium-Look: groesserer Kreis, ondo Ring, Gold-Akzent-Badge
        el.innerHTML = `
          <div class="sv-marker-inner" style="display:flex;flex-direction:column;align-items:center;transition:transform .35s cubic-bezier(.32,.72,0,1);transform-origin:center bottom">
            <div style="width:44px;height:44px;border-radius:50%;border:3px solid ${COL_ONDO};background:linear-gradient(135deg,#fff 60%,rgba(243,192,83,0.12));display:grid;place-items:center;font-family:Montserrat,system-ui,sans-serif;font-size:14px;font-weight:800;color:${COL_NAVY};box-shadow:0 6px 18px rgba(13,27,62,0.22);position:relative">
              ${initials}
              <div style="position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;border-radius:50%;background:#34C759;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></div>
              <div style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#F3C053;border:2px solid #fff;display:grid;place-items:center;font-size:9px;font-weight:900;color:${COL_NAVY}">★</div>
            </div>
            <div style="margin-top:4px;padding:2px 8px;border-radius:999px;background:${COL_NAVY};color:#fff;font-family:Inter,Montserrat,sans-serif;font-size:10px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;box-shadow:0 2px 8px rgba(13,27,62,0.30)">
              Pro
            </div>
          </div>
        `

        const popupHTML = `
          <div style="padding:14px 16px;font-family:Montserrat,system-ui,sans-serif;min-width:220px;max-width:280px">
            <div style="display:inline-block;padding:2px 8px;border-radius:999px;background:#F3C053;color:${COL_NAVY};font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">★ Premium-Partner</div>
            <div style="font-size:13px;font-weight:700;color:${COL_NAVY};line-height:1.3;letter-spacing:-.01em">${name}</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:#10b981;font-weight:600">
              <span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block"></span>
              Verfuegbar mit Kalender-Sync
            </div>
            <button onclick="document.dispatchEvent(new CustomEvent('claimondo:select-sv', { detail: '${sv.id}' }))" style="margin-top:10px;width:100%;border:none;border-radius:999px;background:${COL_ONDO};color:#fff;font-family:inherit;font-size:12px;font-weight:600;padding:8px 12px;cursor:pointer;letter-spacing:-.01em">
              Diesen Premium-Gutachter anfragen
            </button>
          </div>
        `
        const popup = new mapboxgl.Popup({ offset: 28, closeButton: true, maxWidth: '280px' }).setHTML(popupHTML)
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([sv.standort_lng, sv.standort_lat])
          .setPopup(popup)
          .addTo(map)
        markersRef.current.push(marker)
      })

      // ─── Tier-3 Marker (Lead-Partner) — kleiner, grau, ohne Iso ───
      svLeads.forEach((sv) => {
        const initials = (sv.firma ?? sv.name).split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
        const el = document.createElement('div')
        el.style.cursor = 'pointer'
        // Tier-3-Look: kleiner Kreis, neutraler Border, kein Gold-Akzent
        el.innerHTML = `
          <div class="sv-marker-inner" style="display:flex;flex-direction:column;align-items:center;transition:transform .35s cubic-bezier(.32,.72,0,1);transform-origin:center bottom;opacity:0.92">
            <div style="width:32px;height:32px;border-radius:50%;border:2px solid #8a93a6;background:#fff;display:grid;place-items:center;font-family:Montserrat,system-ui,sans-serif;font-size:11px;font-weight:700;color:#4b5468;box-shadow:0 2px 8px rgba(13,27,62,0.12);position:relative">
              ${initials}
            </div>
            <div style="margin-top:3px;padding:1px 6px;border-radius:999px;background:rgba(13,27,62,0.70);color:#fff;font-family:Inter,Montserrat,sans-serif;font-size:9px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;backdrop-filter:blur(8px)">
              ${sv.ort ?? ''}
            </div>
          </div>
        `

        const popupHTML = `
          <div style="padding:14px 16px;font-family:Montserrat,system-ui,sans-serif;min-width:220px;max-width:280px">
            <div style="font-size:13px;font-weight:700;color:${COL_NAVY};line-height:1.3;letter-spacing:-.01em">${sv.firma ?? sv.name}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:3px">${sv.adresse}</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:6px;font-size:11px;color:#10b981;font-weight:600">
              <span style="width:6px;height:6px;border-radius:50%;background:#10b981;display:inline-block"></span>
              Verfuegbar in Ihrer Region
            </div>
            <button onclick="document.dispatchEvent(new CustomEvent('claimondo:select-sv', { detail: '${sv.id}' }))" style="margin-top:10px;width:100%;border:none;border-radius:999px;background:${COL_ONDO};color:#fff;font-family:inherit;font-size:12px;font-weight:600;padding:8px 12px;cursor:pointer;letter-spacing:-.01em">
              Diesen Gutachter anfragen
            </button>
          </div>
        `

        const popup = new mapboxgl.Popup({ offset: 26, closeButton: true, maxWidth: '280px' }).setHTML(popupHTML)

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([sv.lng, sv.lat])
          .setPopup(popup)
          .addTo(map)

        markersRef.current.push(marker)
      })
    })

    // SV-Auswahl-Event abfangen (vom Popup-Button)
    function handleSelect(e: Event) {
      const ce = e as CustomEvent<string>
      setHoveredId(ce.detail)
      sidebarScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      // Auf Mobile das Bottom-Sheet auch oeffnen
      setMobileSheetOpen(true)
    }
    document.addEventListener('claimondo:select-sv', handleSelect)

    return () => {
      document.removeEventListener('claimondo:select-sv', handleSelect)
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [svLeads])

  return (
    <div className="relative w-full" style={{ height: '100dvh' }}>
      {/* Karte als Vollbild-Background */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Ambient-Gradient-Overlay (subtil) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: [
            'radial-gradient(60% 50% at 0% 0%, rgba(13,27,62,0.12), transparent 55%)',
            'radial-gradient(50% 50% at 100% 100%, rgba(69,115,162,0.08), transparent 60%)',
          ].join(', '),
        }}
      />

      {/* Hero-Header oben — sichtbar fuer Crawler + Mobile-Status */}
      <div className="absolute top-0 left-0 right-0 z-[5] px-4 pt-4 sm:px-6 sm:pt-6 pointer-events-none">
        <div
          className="mx-auto max-w-3xl pointer-events-auto"
          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
        >
          <div className="rounded-full border border-white/65 bg-white/75 backdrop-blur-md backdrop-saturate-150 px-4 py-2 flex items-center gap-2 shadow-[0_2px_12px_rgba(13,27,62,0.08)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-claimondo-ondo">
              {aktiveSVs.length > 0
                ? `${aktiveSVs.length} Premium-Partner + ${svLeads.length} weitere Sachverstaendige`
                : `${svLeads.length} Sachverstaendige in Echtzeit verfuegbar`}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar — Glass-Panel mit DynamicWizard */}
      <aside
        ref={sidebarScrollRef}
        className="hidden lg:flex absolute top-20 left-6 bottom-6 w-[420px] z-[10] overflow-y-auto rounded-[28px] border border-white/65 bg-white/82 backdrop-blur-[22px] backdrop-saturate-150 shadow-[0_14px_36px_rgba(13,27,62,0.10),0_40px_80px_rgba(13,27,62,0.08)]"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="flex flex-col w-full p-6">
          <div className="mb-4">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-claimondo-ondo">
              <MapPin className="h-3 w-3" />
              Schritt fuer Schritt
            </span>
            <h1
              className="mt-2 text-[28px] font-bold leading-[1.05] tracking-[-.024em] text-claimondo-navy"
              style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
            >
              Kfz-Gutachter in Ihrer Naehe finden.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
              4 kurze Fragen — wir verbinden Sie mit dem passenden Sachverstaendigen.
            </p>
          </div>
          {wizardSlot}
        </div>
      </aside>

      {/* Mobile Bottom-Sheet (collapsed by default, klick zum oeffnen) */}
      <div
        className="lg:hidden absolute left-0 right-0 bottom-0 z-[10] transition-[transform] duration-500 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{
          transform: mobileSheetOpen ? 'translateY(0)' : 'translateY(calc(100% - 88px))',
        }}
      >
        <div className="rounded-t-[32px] border-t border-x border-white/65 bg-white/85 backdrop-blur-[22px] backdrop-saturate-150 shadow-[0_-14px_36px_rgba(13,27,62,0.12)] max-h-[85dvh] overflow-y-auto">
          <button
            onClick={() => setMobileSheetOpen((v) => !v)}
            className="w-full sticky top-0 z-[1] bg-white/85 backdrop-blur-md px-5 py-3 flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="block w-10 h-1 rounded-full bg-claimondo-navy/30" />
              <span className="text-sm font-semibold text-claimondo-navy" style={{ fontFamily: 'Montserrat' }}>
                {mobileSheetOpen ? 'Gutachter waehlen' : 'Anfrage starten'}
              </span>
            </span>
            <ChevronUp
              className={`h-5 w-5 text-claimondo-ondo transition-transform duration-300 ${mobileSheetOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div className="px-5 pb-6 pt-2">{wizardSlot}</div>
        </div>
      </div>

      {/* Map-Attribution + Powered-By unten rechts (subtil) */}
      <div className="hidden lg:block absolute bottom-3 right-3 z-[5] text-[10px] text-claimondo-navy/40">
        Mapbox · OpenStreetMap
      </div>

      {/* Schreibe HoveredId in den DOM fuer Server-Komponenten die das lesen wollen */}
      {hoveredId && <input type="hidden" data-selected-sv-id={hoveredId} />}
    </div>
  )
}
