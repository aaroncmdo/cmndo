// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings für fill/line paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

// AAR-956 (05.07.) — Kunden-Finder als reine GESAMT-ABDECKUNGS-Ansicht.
// KEINE einzelnen Gutachter mehr (Pins/Profile/Route): der Kunde sieht unsere
// aggregierte Abdeckung — Partner-Einsatzgebiet (kräftig, Union der Partner-
// Isochronen) + die durch Dead-Pins gewährleistete Reichweite (heller, 15-km-
// Kreise). Standardansicht = die Abdeckung selbst (fitBounds), nie eine leere
// Karte. Ort-Eingabe bestätigt nur „in Ihrem Gebiet" / „überregional" — es wird
// KEIN einzelner (versteckter) Gutachter geroutet oder benannt. Das System wählt
// den SV im Booking; sein Name erscheint erst im Slot/auf der Danke-Seite.
//
// Frühere Einzel-Gutachter-Optik (klickbare Avatar-Marker + Profil-Popups +
// Dead-Pins) wurde durch die Abdeckungs-Layer ersetzt (Aaron 05.07.: „unsere
// INSGESAMT Abdeckung, ohne die einzelnen Gutachter").

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
// 2026-05-12: NICHT aus '@/lib/mapbox' (Index) importieren — der Index
// re-exportiert THREE.js/cesium am Top-Level (Public-Bundle-Crash). Direkt aus client.ts.
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import { kmCircle, pointInAnyPolygon, type LngLat } from '@/lib/mapbox/coverage'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import { ChevronUp } from 'lucide-react'
import type { SvLeadPublic, AktiverSVPublic } from '@/lib/actions/gutachter-finder-actions'
// AAR-glass-s1: Liquid-Glass-Design-System.
import { GlassPill, BeratungVereinbarenButton, BeratungModal } from '@/components/shared/glass'

type Props = {
  /** Tier-3 Lead-Partner (sv_leads). Fließen als helle Dead-Pin-Abdeckung (15-km-Kreise). */
  svLeads: SvLeadPublic[]
  /** Tier-1 SVs (sachverstaendige). Fließen als kräftige Partner-Abdeckung (Isochronen-Union).
   * Einzelne Gutachter werden NICHT mehr gezeigt (Aaron 05.07.). */
  aktiveSVs?: AktiverSVPublic[]
  /** Slot für den Inline-Wizard (WS4 — FlowSlotStep). WS1b: Platzhalter aus der Page. */
  wizardSlot?: React.ReactNode
  /** Start-Zentrum aus URL-Param (?stadt / ?plz / ?lat&lng), server-seitig geocodet.
   * Wenn gesetzt: Karte startet hier (statt fitBounds auf die Abdeckung) UND die
   * automatische Geolocation-Abfrage entfällt (explizite User-Wahl gewinnt). */
  initialCenter?: { lat: number; lng: number } | null
  initialZoom?: number
  /** Container-Höhe. Default '100dvh'. */
  height?: string
  /** Test-Override (?fallback=1): erhalten für API-Kompatibilität; ohne Route-Ziel ungenutzt. */
  forceFallback?: boolean
}

// NRW-Mittelpunkt als LETZTER Fallback (nur wenn 0 Abdeckung vorhanden). Normal
// zeigt die Karte per fitBounds die tatsächliche Abdeckung.
const DEFAULT_CENTER: [number, number] = [7.0, 51.0]
const DEFAULT_ZOOM = 8.5
const USER_LOCATION_ZOOM = 10.5

// Coverage-Farben (Claimondo-Palette). Token-Audit-Skip-Header oben deckt die raw
// hex ab — Mapbox-Layer-Paint akzeptiert KEINE CSS var(). Whitelabel-Branding läuft
// über die Tailwind-Klassen der UI-Overlays, nicht über diese Karten-Fills.
const COL_PARTNER = '#4573A2' // Partner-Abdeckung (kräftig, Claimondo-Ondo)
// Dead-Pin-Reichweite = Heatmap in rgba(123,163,204) (= Claimondo-Light #7BA3CC).
const DEADPIN_RADIUS_KM = 15 // = die 15-km-Ghost-Isochrone, in der Dead-Pins vermittelbar sind

// DE-only Embed (AAR-956 Open-Decision #2): Map-Strings inline statt next-intl.
const MAP_STRINGS: Record<string, string> = {
  h1: 'Kfz-Gutachter in Ihrer Nähe finden.',
  sub: '4 kurze Fragen — wir verbinden Sie mit dem passenden Sachverständigen.',
  pill_bundesweit: 'Deutschlandweite Vermittlung',
  pill_covered: 'In Ihrem Gebiet sind wir aktiv',
  pill_ueberregional: 'Wir vermitteln überregional',
  legend_partner: 'Partner-Einsatzgebiet',
  legend_deadpin: 'Erweiterte Reichweite',
  attribution: 'Mapbox · OpenStreetMap',
  error_title: 'Karte konnte nicht geladen werden',
  error_no_token: 'NEXT_PUBLIC_MAPBOX_TOKEN fehlt im Build — das GitHub-Secret ist leer oder nicht gesetzt.',
  error_auth: 'Mapbox lehnt die Anfrage ab (401/403) — Token-URL-Restriction oder ungültiger Token.',
  error_timeout: 'Timeout — das Mapbox-Style-Laden hat nach 12s nicht reagiert (Netzwerk geblockt? CSP? api.mapbox.com nicht erreichbar?).',
  error_generic: 'Mapbox-Fehler:',
  beratung_label: 'Beratung',
}
function tMap(key: string): string {
  return MAP_STRINGS[key] ?? key
}

type CoverageStatus = 'idle' | 'covered' | 'ueberregional'

// AAR-956 (Aaron 14.06.): Status-Pill — Desktop im Header (links), Mobil unten-mittig.
// Zeigt jetzt den Abdeckungs-Status statt einer Gutachter-Zahl (reine Abdeckungs-Ansicht).
function GutachterPill({ status }: { status: CoverageStatus }) {
  const label = status === 'covered' ? tMap('pill_covered') : status === 'ueberregional' ? tMap('pill_ueberregional') : tMap('pill_bundesweit')
  return (
    <GlassPill className="px-3 py-2 sm:px-4 [background:color-mix(in_srgb,white_70%,transparent)] [backdrop-filter:blur(24px)] [-webkit-backdrop-filter:blur(24px)] [border:1px_solid_color-mix(in_srgb,white_50%,transparent)]">
      <span className="relative flex h-2 w-2 flex-shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" aria-hidden />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
      </span>
      <span
        className="text-[11px] sm:text-xs font-semibold whitespace-nowrap"
        style={{
          fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
          color: 'var(--brand-secondary, var(--claimondo-ondo))',
        }}
      >
        {status === 'covered' ? '✓ ' : ''}
        {label}
      </span>
    </GlassPill>
  )
}

// Kleine Karten-Legende (rechts unten, Desktop) — erklärt die zwei Abdeckungs-Töne.
function CoverageLegend() {
  return (
    <div
      className="hidden lg:flex flex-col gap-1.5 absolute bottom-9 right-3 z-[5] rounded-ios-md px-3 py-2 text-[11px] font-medium"
      style={{ background: 'color-mix(in srgb, white 78%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', color: 'var(--brand-primary, var(--claimondo-navy))' }}
    >
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-4 rounded-sm" style={{ background: 'color-mix(in srgb, var(--claimondo-ondo, #4573A2) 45%, transparent)', border: '1px solid color-mix(in srgb, var(--claimondo-ondo, #4573A2) 70%, transparent)' }} aria-hidden />
        {tMap('legend_partner')}
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-4 rounded-sm" style={{ background: 'color-mix(in srgb, #7BA3CC 30%, transparent)' }} aria-hidden />
        {tMap('legend_deadpin')}
      </span>
    </div>
  )
}

export function FinderMap({ svLeads, aktiveSVs = [], wizardSlot, initialCenter = null, initialZoom, height = '100dvh' }: Props) {
  const t = tMap
  const mapRef = useRef<MapboxMap | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const userMarkerRef = useRef<Marker | null>(null) // Geolocation „Sie sind hier"
  const ortMarkerRef = useRef<Marker | null>(null) // eingegebener Besichtigungsort
  // Alle Abdeckungs-Polygone (Partner-Isochronen + Dead-Pin-Kreise) für den
  // client-seitigen „liegt der Ort in der Abdeckung?"-Check.
  const coveragePolysRef = useRef<GeoJSON.Polygon[]>([])

  const [beratungOpen, setBeratungOpen] = useState(false)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true)
  const [coverageStatus, setCoverageStatus] = useState<CoverageStatus>('idle')
  // AAR-956 (Aaron 14.06.): Touch-Drag fürs Anfrage-Bottom-Sheet.
  const sheetDragRef = useRef<number | null>(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const anfrageSheetRef = useRef<HTMLDivElement>(null)
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)

  // AAR-2026-05-12: sichtbarer Map-Diagnose-Status (siehe MAP_STRINGS.error_*).
  const [mapStatus, setMapStatus] = useState<'ok' | 'no-token' | 'auth-error' | 'error' | 'timeout'>('ok')
  const [mapErrorMsg, setMapErrorMsg] = useState<string>('')

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const ok = ensureMapboxInitialized()
    if (!ok) {
      console.error('[gutachter-finden] Mapbox-Init fehlgeschlagen — NEXT_PUBLIC_MAPBOX_TOKEN ist im Build leer/fehlt')
      setMapStatus('no-token')
      return
    }

    // ── Abdeckungs-Geometrie einmalig aus den Props ableiten (rein, synchron) ──
    // Partner-Isochronen (kräftige Fläche).
    const partnerPolys: GeoJSON.Polygon[] = []
    for (const s of aktiveSVs) {
      const poly = s.isochrone_polygon as GeoJSON.Polygon | null
      if (poly && Array.isArray(poly.coordinates) && poly.coordinates.length > 0) partnerPolys.push(poly)
    }
    // Dead-Pin-Reichweite (helle Fläche) = 15-km-Kreise um jeden aktiven Dead-Pin.
    const deadPinPolys: GeoJSON.Polygon[] = svLeads.map((l) => kmCircle(l.lng, l.lat, DEADPIN_RADIUS_KM))
    coveragePolysRef.current = [...partnerPolys, ...deadPinPolys]

    // Gesamt-Bounds der Abdeckung (für die Standardansicht).
    const coverageBounds = new mapboxgl.LngLatBounds()
    let hasCoverage = false
    for (const poly of coveragePolysRef.current) {
      const ring = poly.coordinates?.[0] as LngLat[] | undefined
      if (!ring) continue
      for (const [lng, lat] of ring) {
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          coverageBounds.extend([lng, lat])
          hasCoverage = true
        }
      }
    }

    // Ein MultiPolygon-Feature pro Tier → EIN Fill → keine Overlap-Verdunklung.
    const multi = (polys: GeoJSON.Polygon[]): GeoJSON.Feature => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: polys.map((p) => p.coordinates) },
    })

    const startCenter: [number, number] = initialCenter ? [initialCenter.lng, initialCenter.lat] : DEFAULT_CENTER
    const startZoom = initialCenter ? initialZoom ?? 11 : DEFAULT_ZOOM
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      language: 'de',
      center: startCenter,
      zoom: startZoom,
      pitch: 0,
      bearing: 0,
    })
    mapRef.current = map

    requestAnimationFrame(() => map.resize())
    const resizeObs = new ResizeObserver(() => map.resize())
    resizeObs.observe(containerRef.current)

    let loaded = false
    const loadTimeout = window.setTimeout(() => {
      if (!loaded) {
        console.error('[gutachter-finden] Mapbox-Timeout — load-Event nach 12s nicht gefeuert')
        setMapStatus((s) => (s === 'ok' ? 'timeout' : s))
      }
    }, 12_000)

    map.on('error', (e) => {
      const errObj = e?.error as { message?: string; status?: number } | undefined
      const msg = errObj?.message ?? String(e?.error ?? 'unbekannter Mapbox-Fehler')
      const status = errObj?.status
      if (status === 401 || status === 403 || /unauthorized|forbidden|access token/i.test(msg)) {
        console.error('[gutachter-finden] Mapbox-Auth-Fehler:', status, msg)
        setMapErrorMsg(`${status ? `[${status}] ` : ''}${msg}`)
        setMapStatus('auth-error')
      }
    })

    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()

    map.on('load', () => {
      loaded = true
      window.clearTimeout(loadTimeout)
      map.resize()

      // ── Dead-Pin-Reichweite (heller, UNTEN) — als weiche Heatmap-Wolke statt harter
      //    15-km-Kreise (die stapeln sich fleckig übereinander). Reine Optik: der
      //    Abdeckungs-CHECK (pointInAnyPolygon) nutzt weiterhin die exakten Kreise in
      //    coveragePolysRef. Flacher Farbverlauf → gleichmäßige helle Fläche, kein Hotspot-Look.
      if (svLeads.length > 0) {
        map.addSource('coverage-deadpins', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: svLeads.map((l) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: [l.lng, l.lat] },
            })),
          },
        })
        map.addLayer({
          id: 'coverage-deadpins-heat',
          type: 'heatmap',
          source: 'coverage-deadpins',
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 9, 1.1],
            // Radius ~ 15 km über den Zoom (verdoppelt sich pro Zoomstufe wie die Karte).
            'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 5, 8, 7, 32, 9, 128, 11, 512],
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(123,163,204,0)',
              0.03, 'rgba(123,163,204,0.30)',
              1, 'rgba(123,163,204,0.42)',
            ],
            'heatmap-opacity': 0.85,
          },
        })
      }

      // ── Partner-Einsatzgebiet (kräftig, OBEN) ──
      if (partnerPolys.length > 0) {
        map.addSource('coverage-partners', { type: 'geojson', data: multi(partnerPolys) })
        map.addLayer({
          id: 'coverage-partners-fill',
          type: 'fill',
          source: 'coverage-partners',
          paint: { 'fill-color': COL_PARTNER, 'fill-opacity': 0.18 },
        })
        map.addLayer({
          id: 'coverage-partners-outline',
          type: 'line',
          source: 'coverage-partners',
          // Definierte Kante -> der starke Partner-Kern hebt sich klar von der weichen
          // Dead-Pin-Reichweite ab (die zwei Tiers werden unterscheidbarer).
          paint: { 'line-color': COL_PARTNER, 'line-width': 2.5, 'line-opacity': 0.7 },
        })
      }

      // Standardansicht = die Abdeckung selbst (nie eine leere Karte). URL-Param-
      // Zentrum (?stadt/?plz/?lat&lng) gewinnt, sonst fitBounds auf die Abdeckung.
      if (!initialCenter && hasCoverage) {
        map.fitBounds(coverageBounds, { padding: { top: 80, bottom: 90, left: 60, right: 60 }, duration: 0, maxZoom: 9.5 })
      }
    })

    // Geolocation: nur wenn der Nutzer IM Abdeckungsgebiet ist, dorthin zoomen —
    // sonst bleibt die Abdeckungs-Übersicht stehen (kein Flug in ein leeres Gebiet).
    if (!initialCenter && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          const inside = pointInAnyPolygon([lng, lat], coveragePolysRef.current)
          if (!mapRef.current) return
          // „Sie sind hier"-Marker immer setzen (Trust), aber nur bei Abdeckung hinzoomen.
          userMarkerRef.current?.remove()
          const ueEl = document.createElement('div')
          ueEl.setAttribute('aria-label', 'Ihr Standort')
          ueEl.innerHTML = `
            <div style="position:relative;width:20px;height:20px">
              <div style="position:absolute;inset:-10px;border-radius:50%;background:rgba(69,115,162,0.20);animation:gf-user-pulse 2.4s ease-out infinite"></div>
              <div style="position:absolute;inset:0;border-radius:50%;background:#4573A2;border:3px solid #fff;box-shadow:0 2px 8px rgba(13,27,62,0.40)"></div>
            </div>
          `
          userMarkerRef.current = new mapboxgl.Marker({ element: ueEl, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
          if (inside) {
            map.flyTo({ center: [lng, lat], zoom: USER_LOCATION_ZOOM, duration: 1400, essential: true })
          }
        },
        (err) => {
          console.info('[gutachter-finden] Geolocation verweigert/Fehler:', err.message)
        },
        { timeout: 8000, maximumAge: 60_000 },
      )
    }

    // Ort-Eingabe aus dem Wizard (claimondo:embed-ort {lat,lng}) → Ort-Pin + reine
    // Abdeckungs-Bestätigung (kein Routing zu einem einzelnen Gutachter).
    function handleEmbedOrt(e: Event) {
      const ce = e as CustomEvent<{ lat?: number; lng?: number }>
      const lat = ce.detail?.lat
      const lng = ce.detail?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number' || !mapRef.current) return

      ortMarkerRef.current?.remove()
      const el = document.createElement('div')
      el.setAttribute('aria-label', 'Besichtigungsort')
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:40px;height:40px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0D1B3E;border:3px solid #fff;box-shadow:0 6px 18px rgba(13,27,62,0.35);display:grid;place-items:center">
            <div style="transform:rotate(45deg);display:grid;place-items:center">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 1 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
          </div>
        </div>
      `
      ortMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)

      const covered = pointInAnyPolygon([lng, lat], coveragePolysRef.current)
      setCoverageStatus(covered ? 'covered' : 'ueberregional')
      map.flyTo({ center: [lng, lat], zoom: covered ? 11 : 8.5, duration: 1400, essential: true })
    }
    document.addEventListener('claimondo:embed-ort', handleEmbedOrt)

    return () => {
      window.clearTimeout(loadTimeout)
      document.removeEventListener('claimondo:embed-ort', handleEmbedOrt)
      resizeObs.disconnect()
      userMarkerRef.current?.remove()
      ortMarkerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
    // Karte NUR einmal (mount) initialisieren — svLeads/aktiveSVs sind im Embed statisch
    // (server-once geladen). [] korrekt (sonst Re-Init bei RSC-Refresh → Abdeckung weg).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative w-full" style={{ height }}>
      <style>{`
        @keyframes gf-user-pulse {
          0% { transform: scale(0.5); opacity: 0.55; }
          80%, 100% { transform: scale(1.9); opacity: 0; }
        }
        /* Google-Places-Dropdown (.pac-container) in unsere Tokens bringen. Google
           rendert es an document.body → global; greift nur solange der Embed gemountet
           ist. Doppelklasse = höhere Spezifität als Googles Default-Stylesheet. */
        .pac-container.pac-container {
          margin-top: 6px;
          padding: 4px;
          border: 1px solid var(--claimondo-border, #e4e7ef);
          border-radius: var(--radius-ios-md, 18px);
          box-shadow: 0 14px 36px rgba(13, 27, 62, 0.14);
          background: #fff;
          font-family: var(--font-montserrat, "Montserrat", system-ui, sans-serif);
        }
        .pac-container .pac-item {
          border: 0;
          border-radius: var(--radius-ios-sm, 12px);
          padding: 9px 12px;
          font-size: 13px;
          line-height: 1.3;
          color: var(--claimondo-navy, #0D1B3E);
          cursor: pointer;
        }
        .pac-container .pac-item:hover,
        .pac-container .pac-item-selected {
          background: color-mix(in srgb, var(--claimondo-ondo, #4573A2) 12%, transparent);
        }
        .pac-container .pac-item-query {
          font-size: 13px;
          font-weight: 600;
          color: var(--claimondo-navy, #0D1B3E);
        }
        .pac-container .pac-matched { font-weight: 700; }
        .pac-container .pac-icon { display: none; }
      `}</style>

      {/* Karte als Vollbild-Background. position/inset MÜSSEN inline stehen (mapbox-gl
          setzt .mapboxgl-map{position:relative} → würde eine .absolute-Utility schlagen
          → Höhe kollabiert auf 0). Inline-Style schlägt die Stylesheet-Klasse. */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, background: 'var(--brand-surface, #FFFFFF)' }}
      />

      {/* AAR-Diagnose: sichtbare Map-Fehlermeldung (nur wenn was schiefläuft). */}
      {mapStatus !== 'ok' && (
        <div className="absolute bottom-4 right-4 z-[6] max-w-[460px] rounded-ios-md bg-amber-50/95 border border-amber-200 px-4 py-3 text-[12.5px] text-amber-900 shadow-lg backdrop-blur-md">
          <strong className="block mb-0.5">{t('error_title')}</strong>
          {mapStatus === 'no-token' && t('error_no_token')}
          {mapStatus === 'auth-error' && (
            <>{t('error_auth')}{mapErrorMsg && <span className="block mt-1 font-mono text-[11px] opacity-75">{mapErrorMsg}</span>}</>
          )}
          {mapStatus === 'timeout' && t('error_timeout')}
          {mapStatus === 'error' && (
            <>{t('error_generic')}<span className="block mt-1 font-mono text-[11px] opacity-75">{mapErrorMsg || '(keine Message)'}</span></>
          )}
        </div>
      )}

      {/* Sehr subtiler Ambient-Schatten unten/links für Tiefe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(70% 90% at 8% 60%, color-mix(in srgb, transparent 92%, var(--brand-primary, var(--claimondo-navy))), transparent 75%)',
        }}
      />

      {/* Frosted-Glass-Schleier hinter der Wizard-Spalte (nur Desktop). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-[2] hidden lg:block"
        style={{
          width: 'clamp(520px, 44vw, 820px)',
          background:
            'linear-gradient(100deg, color-mix(in srgb, var(--glass-tint-soft) 80%, transparent) 0%, color-mix(in srgb, var(--glass-tint-soft) 52%, transparent) 38%, color-mix(in srgb, var(--glass-tint-soft) 22%, transparent) 64%, transparent 92%)',
          backdropFilter: 'blur(22px) saturate(1.05)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.05)',
          maskImage: 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,.35) 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,.35) 80%, transparent 100%)',
        }}
      />

      {/* Hero-Header oben — Status-Glass-Pill links, Beratung-CTA rechts. */}
      <div className="absolute top-0 left-0 right-0 z-[5] px-3 pt-3 sm:px-6 sm:pt-6 pointer-events-none">
        <div className="flex items-center justify-end sm:justify-between gap-2 pointer-events-auto">
          <div className="hidden sm:block">
            <GutachterPill status={coverageStatus} />
          </div>
          <BeratungVereinbarenButton onClick={() => setBeratungOpen(true)} className="hidden sm:inline-flex [background:color-mix(in_srgb,white_60%,transparent)] [backdrop-filter:blur(20px)_saturate(1.4)] [-webkit-backdrop-filter:blur(20px)_saturate(1.4)] border-white/50 text-claimondo-ondo" />
          <BeratungVereinbarenButton onClick={() => setBeratungOpen(true)} label={t('beratung_label')} className="sm:hidden flex-shrink-0 text-[12px] px-3 [background:color-mix(in_srgb,white_60%,transparent)] [backdrop-filter:blur(20px)_saturate(1.4)] [-webkit-backdrop-filter:blur(20px)_saturate(1.4)] border-white/50 text-claimondo-ondo" />
        </div>
      </div>

      {/* Status-Pill auf Mobil unten-mittig über dem Anfrage-Sheet — ausgeblendet wenn offen. */}
      {!mobileSheetOpen && (
        <div className="sm:hidden pointer-events-none absolute inset-x-0 bottom-[72px] z-[8] flex justify-center">
          <GutachterPill status={coverageStatus} />
        </div>
      )}

      <CoverageLegend />

      {/* Desktop — Wizard FREISCHWEBEND direkt auf der Karte. */}
      <div
        ref={sidebarScrollRef}
        className="hidden lg:flex flex-col absolute top-[68px] left-1 bottom-1 z-[10] overflow-y-auto [&::-webkit-scrollbar]:hidden"
        style={{
          width: 'clamp(440px, 33vw, 620px)',
          padding: 28,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <div className="flex flex-col gap-1.5 mb-6">
          <h1
            className="text-[30px] font-extrabold leading-[1.06] tracking-[-.024em]"
            style={{
              fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
              color: 'var(--brand-primary, var(--claimondo-navy))',
              textShadow: '0 1px 0 rgba(255,255,255,.85), 0 0 24px rgba(255,255,255,.7)',
            }}
          >
            {t('h1')}
          </h1>
          <p
            className="text-sm leading-relaxed font-medium"
            style={{
              fontFamily: 'var(--font-body, "Noto Sans", system-ui, sans-serif)',
              color: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 68%, transparent)',
              textShadow: '0 1px 0 rgba(255,255,255,.6)',
            }}
          >
            {t('sub')}
          </p>
        </div>
        {wizardSlot}
      </div>

      {/* Mobile Bottom-Sheet (Wizard). AUSGEFAHREN by default (Aaron 04.07.). */}
      <div
        ref={anfrageSheetRef}
        className="lg:hidden absolute left-0 right-0 bottom-0 z-[10] transition-[transform] duration-500 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{
          transform: `${mobileSheetOpen ? 'translateY(0)' : 'translateY(calc(100% - 56px))'} translateY(${sheetDragY}px)`,
          transition: sheetDragRef.current !== null ? 'none' : undefined,
        }}
      >
        <div
          className="rounded-t-[32px] border-x border-t border-white/50 bg-white/70 backdrop-blur-xl max-h-[85dvh] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
          style={{
            boxShadow: '0 -14px 36px color-mix(in srgb, transparent 85%, var(--brand-primary, var(--claimondo-navy)))',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <button
            onClick={() => setMobileSheetOpen((v) => !v)}
            onTouchStart={(e) => {
              sheetDragRef.current = e.touches[0].clientY
            }}
            onTouchMove={(e) => {
              const start = sheetDragRef.current
              if (start == null) return
              const dy = e.touches[0].clientY - start
              const maxDrag = Math.max(0, (anfrageSheetRef.current?.offsetHeight ?? 600) - 56)
              setSheetDragY(mobileSheetOpen ? Math.max(0, Math.min(dy, maxDrag)) : Math.min(0, Math.max(dy, -maxDrag)))
            }}
            onTouchEnd={(e) => {
              const start = sheetDragRef.current
              sheetDragRef.current = null
              setSheetDragY(0)
              if (start == null) return
              e.preventDefault()
              const dy = e.changedTouches[0].clientY - start
              if (dy < -24) setMobileSheetOpen(true)
              else if (dy > 24) setMobileSheetOpen(false)
              else setMobileSheetOpen((v) => !v)
            }}
            aria-label={mobileSheetOpen ? 'Schließen' : 'Anfrage öffnen'}
            className="w-full px-5 pt-2.5 pb-1 flex items-center justify-center touch-none"
          >
            <ChevronUp
              className={`h-6 w-6 transition-transform duration-300 ${mobileSheetOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--brand-secondary, var(--claimondo-ondo))' }}
            />
          </button>
          <div className="px-1 pb-6 pt-1 [&>div]:bg-transparent [&>div]:border-transparent [&>div]:shadow-none [&>div]:backdrop-blur-none">
            {wizardSlot}
          </div>
        </div>
      </div>

      {/* Map-Attribution unten rechts (subtil) */}
      <div className="hidden lg:block absolute bottom-3 right-3 z-[5] text-[10px] text-claimondo-navy/40">
        {t('attribution')}
      </div>

      {/* Beratung-Rückruf-Modal auf Root-Ebene. */}
      <BeratungModal open={beratungOpen} onClose={() => setBeratungOpen(false)} quelle="embed-gutachter-finder" />
    </div>
  )
}
