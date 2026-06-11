// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings für marker fills + paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

// AAR-956 WS1b — portiert aus claimondo-marketing/app/[locale]/gutachter-finden/
// GutachterFinderMapClient.tsx in die Haupt-App (Embed-Route /embed/gutachter-finder).
// next-intl → inline DE (Open-Decision #2); ansonsten visuell deckungsgleich.
// WS2 redesignt das Pin-Popup (+ GoogleBewertungBadge), WS3 Route/Zoom, WS4 füllt wizardSlot.
//
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
import { ChevronUp } from 'lucide-react'
import type { SvLeadPublic, AktiverSVPublic } from '@/lib/actions/gutachter-finder-actions'
// AAR-glass-s1: Liquid-Glass-Design-System (siehe
// docs/superpowers/specs/2026-05-12-claimondo-glass-design-system.md).
import { GlassPill, BeratungVereinbarenButton } from '@/components/shared/glass'
import { createRoot, type Root } from 'react-dom/client'
import { SvProfilePopup } from './SvProfilePopup'

type Props = {
  /** Tier-3 Lead-Partner (sv_leads). Dead-Pins, nicht klickbar, kein Popup. */
  svLeads: SvLeadPublic[]
  /** Tier-1 SVs (sachverstaendige). 2026-06-02 (Aaron): JEDER verifizierte,
   * aktive SV ist klickbar mit anonymem Profil-Popup (RLS-gegated). */
  aktiveSVs?: AktiverSVPublic[]
  /** Slot für den Inline-Wizard (WS4 — FlowSlotStep). WS1b: Platzhalter aus der Page. */
  wizardSlot?: React.ReactNode
  /** Doc 34 0a.3: Start-Zentrum aus URL-Param (?stadt / ?plz / ?lat&lng),
   * server-seitig via Mapbox geocodet. Wenn gesetzt, startet die Karte hier
   * UND die automatische Geolocation-Abfrage entfällt (explizite User-Wahl
   * gewinnt). Ohne Wert = bisheriges Verhalten (NRW-Default + Geolocation). */
  initialCenter?: { lat: number; lng: number } | null
  initialZoom?: number
  /** Container-Höhe. Default '100dvh' (Vollseite, z.B. /gutachter-finden).
   * Für In-Page-Sections z.B. '78vh' oder '680px' übergeben — Karte + Overlays
   * sind container-relativ und skalieren mit. */
  height?: string
}

// NRW-Mittelpunkt — gute Start-Ansicht da die 62 SVs hauptsächlich in NRW
// liegen (Excel-Import vom 11.05.2026). Fallback wenn der User die
// Geolocation-Permission ablehnt oder kein Standort verfügbar ist.
const DEFAULT_CENTER: [number, number] = [7.0, 51.0]
const DEFAULT_ZOOM = 8.5
const USER_LOCATION_ZOOM = 10.5

// AAR-906: Marker-Colors über CSS-Vars (Whitelabel-fähig, Claimondo-Fallback).
// Mapbox baut die Marker via innerHTML aus Template-Literals — `var()`-Strings
// werden vom Browser beim Style-Resolution-Pass evaluiert.
// Mapbox-Layer-Paint (fill-color, line-color) akzeptiert NUR raw color-strings,
// keine CSS `var()`. Token-Audit-Skip-Header oben erlaubt diese hex literals.
// Whitelabel-Branding läuft an anderer Stelle (var(--brand-*) in Tailwind-
// Klassen + globals.css-Aliase auf claimondo-* Tokens).
const COL_ONDO = '#4573A2'
const COL_NAVY = '#0D1B3E'

// Generischer Dead-Pin (Claimondo-Logo-Look) — nicht klickbar, kein Hover,
// kein Popup. Wird für SVs mit paket!='standard' UND alle sv_leads
// (Tier-3 Excel-Imports) verwendet. Zweck: zeigt Marker-Dichte ohne SV-Identität.
function addDeadPin(
  map: MapboxMap,
  store: Marker[],
  lng: number,
  lat: number,
) {
  const el = document.createElement('div')
  // pointer-events:none + cursor:default → kein Klick, kein Hand-Cursor.
  // Mapbox propagiert Klicks dann an die Karte (Pan/Zoom) statt an den Pin.
  el.style.pointerEvents = 'none'
  el.style.cursor = 'default'
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = `
    <div class="sv-deadpin" style="width:18px;height:18px;display:grid;place-items:center;border-radius:50%;background:${COL_NAVY};box-shadow:0 2px 6px rgba(13,27,62,0.30);border:2px solid #fff">
      <span style="font-family:Montserrat,system-ui,sans-serif;font-size:9px;font-weight:900;color:#fff;line-height:1;letter-spacing:-.02em">C</span>
    </div>
  `
  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(map)
  store.push(marker)
}

// Klickbarer Avatar-Marker für verifizierte SVs. Click → onClick (öffnet das
// React-Profil-Popup über dem Pin, WS2). KEIN setPopup/HTML-Popup + kein
// Wizard-CTA mehr — die Buchung läuft über den 3-Step-Wizard (WS4), den SV
// wählt das System (WS3).
function addClickableMarker(
  map: MapboxMap,
  store: Marker[],
  sv: AktiverSVPublic,
  onClick: () => void,
) {
  const initiale = sv.vorname_initiale ?? '·'
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.innerHTML = `
    <div class="sv-marker-inner" style="display:flex;flex-direction:column;align-items:center;transition:transform .35s cubic-bezier(.32,.72,0,1);transform-origin:center bottom">
      <div style="width:40px;height:40px;border-radius:50%;border:3px solid ${COL_ONDO};background:#fff;display:grid;place-items:center;font-family:Montserrat,system-ui,sans-serif;font-size:15px;font-weight:800;color:${COL_NAVY};box-shadow:0 6px 18px rgba(13,27,62,0.22);position:relative">
        ${initiale}
        <div style="position:absolute;bottom:-3px;right:-3px;width:12px;height:12px;border-radius:50%;background:#34C759;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></div>
      </div>
    </div>
  `
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick()
  })
  const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([sv.standort_lng, sv.standort_lat])
    .addTo(map)
  store.push(marker)
}

// DE-only Embed (AAR-956 Open-Decision #2): Map-Strings inline statt next-intl.
// Die Marketing-SEO-Seite bleibt ×6 lokalisiert; der Embed ist eine deutsche
// Claimondo-Fläche. Lokaler t-Shim hält die Call-Sites unverändert.
const MAP_STRINGS: Record<string, string> = {
  h1: 'Kfz-Gutachter in Ihrer Nähe finden.',
  sub: '4 kurze Fragen — wir verbinden Sie mit dem passenden Sachverständigen.',
  pill_near: '{count} Sachverständige in Ihrer Nähe',
  pill_bundesweit: '{count} Sachverständige bundesweit verfügbar',
  pill_short_near: '{count} SVs in Ihrer Nähe',
  pill_short_bundesweit: '{count} SVs verfügbar',
  sheet_open: 'Karte zeigen',
  sheet_closed: 'Anfrage starten',
  attribution: 'Mapbox · OpenStreetMap',
  error_title: 'Karte konnte nicht geladen werden',
  error_no_token: 'NEXT_PUBLIC_MAPBOX_TOKEN fehlt im Build — das GitHub-Secret ist leer oder nicht gesetzt.',
  error_auth: 'Mapbox lehnt die Anfrage ab (401/403) — Token-URL-Restriction oder ungültiger Token.',
  error_timeout: 'Timeout — das Mapbox-Style-Laden hat nach 12s nicht reagiert (Netzwerk geblockt? CSP? api.mapbox.com nicht erreichbar?).',
  error_generic: 'Mapbox-Fehler:',
  beratung_label: 'Beratung',
}
function tMap(key: string, vars?: { count?: number }): string {
  const s = MAP_STRINGS[key] ?? key
  return typeof vars?.count === 'number' ? s.replace('{count}', String(vars.count)) : s
}

export function FinderMap({ svLeads, aktiveSVs = [], wizardSlot, initialCenter = null, initialZoom, height = '100dvh' }: Props) {
  const t = tMap
  const mapRef = useRef<MapboxMap | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)
  const popupRootRef = useRef<Root | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  // 2026-05-12 Aaron-Smoke: Wir fragen Geolocation beim Page-Load ab, damit
  // "In Ihrer Nähe"-Behauptung im Header ehrlich ist und die Karte direkt
  // zum User zoomt. Bei Deny bleibt es bei NRW-Mittelpunkt + neutralem Badge.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  // AAR-2026-05-12: sichtbarer Map-Diagnose-Status — damit man ohne DevTools
  // sieht WARUM die Karte ggf. nicht rendert. 'no-token' = NEXT_PUBLIC_MAPBOX_TOKEN
  // fehlte im Build. 'auth-error' = Mapbox lehnt die Anfrage ab (401/403).
  // 'error' = irgendein anderer Mapbox-Fehler (Message in mapErrorMsg).
  // 'timeout' = map.on('load') ist nach 12s nicht gefeuert (Style hängt).
  // 'ok' = alles gut.
  const [mapStatus, setMapStatus] = useState<'ok' | 'no-token' | 'auth-error' | 'error' | 'timeout'>('ok')
  const [mapErrorMsg, setMapErrorMsg] = useState<string>('')

  // Sticky-Marker: wenn der User auf einen SV klickt, merken wir uns die ID
  // und scrollen die Wizard-Sidebar zum Anfang. Spätere Iteration:
  // pre_selected_sv-Wert in den DynamicWizard schreiben.
  // (Aktuell reicht der Scroll, weil der Wizard sich Server-side rendert.)
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const ok = ensureMapboxInitialized()
    if (!ok) {
      // Token-Init failed — fail loud im Smoke statt silent
      console.error('[gutachter-finden] Mapbox-Init fehlgeschlagen — NEXT_PUBLIC_MAPBOX_TOKEN ist im Build leer/fehlt')
      setMapStatus('no-token')
      return
    }
    // Doc 34 0a.3: URL-Param-Zentrum (?stadt/?plz/?lat&lng) gewinnt über den
    // NRW-Default. Ohne initialCenter bleibt es bei NRW-Mittelpunkt + Geolocation.
    const startCenter: [number, number] = initialCenter
      ? [initialCenter.lng, initialCenter.lat]
      : DEFAULT_CENTER
    const startZoom = initialCenter ? (initialZoom ?? 11) : DEFAULT_ZOOM
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: startCenter,
      zoom: startZoom,
      pitch: 35,
      bearing: -8,
    })
    mapRef.current = map

    // WS2: Profil-Popup ÜBER dem Pin (anchor:'bottom') via React-Render
    // (createRoot + setDOMContent, Pattern wie DispatchKarteClient). View-only,
    // kein Wizard-CTA. Single-Popup: alter Popup + Root werden vorher entsorgt.
    function openSvPopup(sv: AktiverSVPublic) {
      popupRef.current?.remove()
      popupRootRef.current?.unmount()
      const container = document.createElement('div')
      const root = createRoot(container)
      root.render(<SvProfilePopup sv={sv} />)
      const popup = new mapboxgl.Popup({
        offset: 22,
        closeButton: true,
        maxWidth: '300px',
        anchor: 'bottom',
        className: 'sv-finder-popup',
      })
        .setLngLat([sv.standort_lng, sv.standort_lat])
        .setDOMContent(container)
        .addTo(map)
      popup.on('close', () => {
        root.unmount()
        if (popupRef.current === popup) popupRef.current = null
        if (popupRootRef.current === root) popupRootRef.current = null
      })
      setHoveredId(sv.id)
      popupRef.current = popup
      popupRootRef.current = root
    }

    // resize() nach dem nächsten Frame + beim load-Event, plus ein
    // ResizeObserver — robust gegen Container-Größenänderungen (Layout-Settle,
    // Sidebar-Toggle, Viewport-Resize). Schadet nie, kostet nichts.
    requestAnimationFrame(() => map.resize())
    const resizeObs = new ResizeObserver(() => map.resize())
    resizeObs.observe(containerRef.current)

    // Load-Timeout: wenn die Karte nach 12s noch nicht 'load' gefeuert hat,
    // hängt der Style (Netzwerk, geblockter Request o.ä.) — sichtbar machen.
    let loaded = false
    const loadTimeout = window.setTimeout(() => {
      if (!loaded) {
        console.error('[gutachter-finden] Mapbox-Timeout — load-Event nach 12s nicht gefeuert (Style hängt?)')
        setMapStatus((s) => (s === 'ok' ? 'timeout' : s))
      }
    }, 12_000)

    // ALLE Mapbox-Fehler abfangen + verbatim sichtbar machen — ohne DevTools-Raten.
    map.on('error', (e) => {
      const errObj = e?.error as { message?: string; status?: number } | undefined
      const msg = errObj?.message ?? String(e?.error ?? 'unbekannter Mapbox-Fehler')
      const status = errObj?.status
      console.error('[gutachter-finden] Mapbox-Fehler:', status, msg, e)
      setMapErrorMsg(`${status ? `[${status}] ` : ''}${msg}`)
      if (status === 401 || status === 403 || /unauthorized|forbidden|access token/i.test(msg)) {
        setMapStatus('auth-error')
      } else {
        setMapStatus((s) => (s === 'auth-error' ? s : 'error'))
      }
    })

    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()

    map.on('load', () => {
      loaded = true
      window.clearTimeout(loadTimeout)
      map.resize() // 2026-05-12: nochmal resize beim load, falls der Container zwischenzeitlich gewachsen ist
      // 2026-05-12: 3D-Buildings-Layer ENTFERNT — die interpolate-Ausdrücke
      // waren kaputt (Stops als verschachtelte Arrays statt flach), das hat
      // die Mapbox-Render-Loop abgestürzt → schwarze Karte. War nur ein
      // dezenter Tiefe-Effekt ab Zoom 13 (Default-Zoom ist 8.5), also kein
      // Verlust. Falls wieder gewünscht: korrekte interpolate-Syntax nutzen
      // (['interpolate', ['linear'], input, stop1_in, stop1_out, stop2_in, ...]).

      // Iso-Halos (Coverage-Radius) für alle verifizierten aktiven SVs.
      // 2026-06-02 (Aaron "die Profile sollen public sein"): zuvor nur
      // paket='standard' (Dead-Pin-Privacy-Default). Da jetzt jeder verifizierte
      // SV ein öffentliches Profil ist, bekommt er auch sein Coverage-Halo.
      // Tier-3 sv_leads bleiben ohne Iso.
      const tier1Features = aktiveSVs
        .filter((s) => s.isochrone_polygon)
        .map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, tier: 'standard' },
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

      // ─── Tier-1 Marker ─────────────────────────────────────────────
      // 2026-06-02 (Aaron: "die Profile sollen public sein"): ALLE verifizierten,
      // aktiven SVs (sachverstaendige — RLS-gegated auf verifiziert + ist_aktiv +
      // map_ready) werden als klickbarer Avatar-Marker mit anonymem Profil-Popup
      // gerendert (Region, Sterne, Specs, Vorname-Initiale). Verifizierte SVs sind
      // consented Partner, die gefunden werden WOLLEN — kein paket-abhängiger
      // Dead-Pin mehr. Nur Tier-3 sv_leads (Excel-Import ohne Consent) bleiben
      // Dead-Pins. Buchung läuft weiterhin ausschließlich über den Wizard.
      aktiveSVs.forEach((sv) => {
        addClickableMarker(map, markersRef.current, sv, () => openSvPopup(sv))
      })

      // ─── Tier-3 sv_leads — immer Dead-Pin ────────────────────────────
      svLeads.forEach((sv) => {
        addDeadPin(map, markersRef.current, sv.lng, sv.lat)
      })
    })

    // WS2: Popup ist jetzt view-only (React-Profil). Die alte claimondo:open-wizard /
    // claimondo:select-sv-Verdrahtung (Self-Dispatch der Marketing-Karte) entfällt —
    // im Embed wählt das System den SV (WS3), Buchung über den Inline-Wizard (WS4).

    // 2026-05-12 Aaron-Smoke: Beim Page-Load Geolocation anfragen. Bei
    // Allow: Map zoomt zum User, Header-Badge wechselt auf "in Ihrer
    // Nähe". Bei Deny / Timeout: Default-NRW-View bleibt, Header-Badge
    // sagt "bundesweit". Hinweis: 'navigator.geolocation' braucht HTTPS
    // im Browser — auf Staging/Production gegeben.
    if (!initialCenter && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setUserLocation({ lat, lng })
          map.flyTo({ center: [lng, lat], zoom: USER_LOCATION_ZOOM, duration: 1400, essential: true })
        },
        (err) => {
          console.info('[gutachter-finden] Geolocation verweigert/Fehler:', err.message)
        },
        { timeout: 8000, maximumAge: 60_000 },
      )
    }

    return () => {
      window.clearTimeout(loadTimeout)
      resizeObs.disconnect()
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      popupRootRef.current?.unmount()
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [svLeads])

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Karte als Vollbild-Background. Fallback-Gradient (--brand-surface-gradient)
          falls Mapbox nicht lädt (Token-Restriction o.ä.) — dann sieht's
          wenigstens nach Brand-Surface aus statt nach leerem Weiß. Sobald die
          Map-Tiles laden, decken sie den Gradient ab. */}
      {/* WICHTIG: position/inset MÜSSEN inline stehen, nicht als Tailwind-Klasse.
          mapbox-gl fügt dem Container die Klasse `mapboxgl-map` hinzu und
          `mapbox-gl.css` setzt `.mapboxgl-map { position: relative }` — das
          würde eine `.absolute`-Utility-Klasse überschreiben (gleiche
          Spezifität, mapbox-CSS später in der Source-Order) → Container
          verliert den bottom-Anker → Höhe kollabiert auf 0 → leerer Canvas,
          KEIN Fehler. Inline-Style schlägt die Stylesheet-Klasse. */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, background: 'var(--brand-surface, #FFFFFF)' }}
      />

      {/* AAR-Diagnose: sichtbare Map-Fehlermeldung (nur wenn was schiefläuft) —
          damit man ohne DevTools weiß was los ist. Bei 'error' wird die
          Original-Mapbox-Message verbatim angezeigt. */}
      {mapStatus !== 'ok' && (
        <div className="absolute bottom-4 right-4 z-[6] max-w-[460px] rounded-ios-md bg-amber-50/95 border border-amber-200 px-4 py-3 text-[12.5px] text-amber-900 shadow-lg backdrop-blur-md">
          <strong className="block mb-0.5">{t('error_title')}</strong>
          {mapStatus === 'no-token' && (
            t('error_no_token')
          )}
          {mapStatus === 'auth-error' && (
            <>{t('error_auth')}{mapErrorMsg && <span className="block mt-1 font-mono text-[11px] opacity-75">{mapErrorMsg}</span>}</>
          )}
          {mapStatus === 'timeout' && (
            t('error_timeout')
          )}
          {mapStatus === 'error' && (
            <>{t('error_generic')}<span className="block mt-1 font-mono text-[11px] opacity-75">{mapErrorMsg || '(keine Message)'}</span></>
          )}
        </div>
      )}

      {/* Sehr subtiler Ambient-Schatten unten/links für Tiefe — KEIN Rahmen,
          kein weißer Veil. Diffus, randlos. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(70% 90% at 8% 60%, color-mix(in srgb, transparent 92%, var(--brand-primary, var(--claimondo-navy))), transparent 75%)',
        }}
      />

      {/* Frosted-Glass-Schleier hinter der freischwebenden Wizard-Spalte (nur Desktop).
          KEIN Rahmen, KEINE Card — eine weiche, gemaskte Milchglas-Zone die links
          full-bleed (top→bottom) liegt und nach RECHTS in den Map-Detailreichtum
          ausläuft (mask-image fadet sowohl Tint als auch Blur). Beruhigt die Karte
          unter Headline/Beschreibung/Feldern → Text wird lesbar, ohne dass es nach
          „Box auf der Karte" aussieht. z-[2]: über dem Ambient-Radial, UNTER Header
          (z-5) + Wizard (z-10), damit nur die Karte verwischt wird, nicht die UI. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-[2] hidden lg:block"
        style={{
          width: 'clamp(520px, 44vw, 820px)',
          background:
            'linear-gradient(100deg, color-mix(in srgb, #f8f9fb 80%, transparent) 0%, color-mix(in srgb, #f8f9fb 52%, transparent) 38%, color-mix(in srgb, #f8f9fb 22%, transparent) 64%, transparent 92%)',
          backdropFilter: 'blur(22px) saturate(1.05)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.05)',
          maskImage: 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,.35) 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,.35) 80%, transparent 100%)',
        }}
      />

      {/* Hero-Header oben — Status-Glass-Pill links, Beratung-CTA rechts (full-bleed).
          Mobile: kurzer Pill-Text + Beratung als Icon-only-Pill, sonst läuft's über. */}
      <div className="absolute top-0 left-0 right-0 z-[5] px-3 pt-3 sm:px-6 sm:pt-6 pointer-events-none">
        <div className="flex items-center justify-between gap-2 pointer-events-auto">
          <GlassPill className="px-3 py-2 sm:px-4">
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
              {/* Kurz auf Mobile */}
              <span className="sm:hidden">
                {userLocation
                  ? t('pill_short_near', { count: svLeads.length + aktiveSVs.length })
                  : t('pill_short_bundesweit', { count: svLeads.length + aktiveSVs.length })}
              </span>
              {/* Voll ab sm — Aaron 14.05.2026: kein "Premium-Partner"-Wording
                  mehr (Privacy-Refactor: paket-Detail wird nicht preisgegeben).
                  Einheitliche Sachverständigen-Zählung. */}
              <span className="hidden sm:inline">
                {userLocation
                  ? t('pill_near', { count: svLeads.length + aktiveSVs.length })
                  : t('pill_bundesweit', { count: svLeads.length + aktiveSVs.length })}
              </span>
            </span>
          </GlassPill>
          {/* AAR-glass-s1: Permanenter Beratungs-CTA oben rechts. Auf Mobile
              kürzeres Label ("Beratung") damit's neben dem Status-Pill passt. */}
          <BeratungVereinbarenButton className="hidden sm:inline-flex" />
          <BeratungVereinbarenButton label={t('beratung_label')} className="sm:hidden flex-shrink-0 text-[12px] px-3" />
        </div>
      </div>

      {/* Desktop — Wizard FREISCHWEBEND direkt auf der Karte. Kein Card-Wrapper,
          dynamische Breite (clamp). WICHTIG: paddingInline 28px — overflow-y-auto
          impliziert overflow-x:hidden, also würden die ~28px Glass-Pill-Schatten
          am rechten Spaltenrand abgeschnitten. Das Padding gibt ihnen Raum
          INNERHALB der Overflow-Box → kein Clip. Spalte ist breiter angesetzt
          damit nach Abzug des Paddings noch genug Content-Breite bleibt.
          Negatives left/top kompensiert das Padding visuell (Content sitzt
          dort wo er soll, das Padding ist nur "Schatten-Raum"). */}
      <div
        ref={sidebarScrollRef}
        // AAR-902: scrollbar visuell unterdrueckt (Aaron-Feedback 14.05.2026).
        // overflow-y-auto bleibt fuer Touch/Wheel-Scroll, aber die Bar selbst
        // ist via scrollbar-width:none + ::-webkit-scrollbar:hidden ausgeblendet.
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

      {/* Mobile Bottom-Sheet (collapsed by default, klick zum Öffnen).
          AAR-glass-s1: Glass-Tokens statt hartkodierter bg-white/85. */}
      <div
        className="lg:hidden absolute left-0 right-0 bottom-0 z-[10] transition-[transform] duration-500 ease-[cubic-bezier(.32,.72,0,1)]"
        style={{
          transform: mobileSheetOpen ? 'translateY(0)' : 'translateY(calc(100% - 88px))',
        }}
      >
        <div
          // AAR-902: scrollbar visuell unterdrueckt (Aaron-Feedback 14.05.2026).
          className="rounded-t-[32px] [background:var(--glass-bg-nested)] [backdrop-filter:var(--glass-blur-strong)] [-webkit-backdrop-filter:var(--glass-blur-strong)] max-h-[85dvh] overflow-y-auto [&::-webkit-scrollbar]:hidden"
          style={{
            borderTop: 'var(--glass-border-nested)',
            borderLeft: 'var(--glass-border-nested)',
            borderRight: 'var(--glass-border-nested)',
            boxShadow: '0 -14px 36px color-mix(in srgb, transparent 85%, var(--brand-primary, var(--claimondo-navy)))',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <button
            onClick={() => setMobileSheetOpen((v) => !v)}
            className="w-full sticky top-0 z-[1] [background:var(--glass-bg-nested)] [backdrop-filter:var(--glass-blur)] [-webkit-backdrop-filter:var(--glass-blur)] px-5 py-3 flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span
                className="block w-10 h-1 rounded-full"
                style={{ background: 'color-mix(in srgb, var(--brand-primary, var(--claimondo-navy)) 30%, transparent)' }}
              />
              <span
                className="text-sm font-semibold"
                style={{
                  fontFamily: 'var(--font-heading, "Montserrat", system-ui, sans-serif)',
                  color: 'var(--brand-primary, var(--claimondo-navy))',
                }}
              >
                {mobileSheetOpen ? t('sheet_open') : t('sheet_closed')}
              </span>
            </span>
            <ChevronUp
              className={`h-5 w-5 transition-transform duration-300 ${mobileSheetOpen ? 'rotate-180' : ''}`}
              style={{ color: 'var(--brand-secondary, var(--claimondo-ondo))' }}
            />
          </button>
          <div className="px-5 pb-6 pt-2">
            {/* Beratungs-CTA auch im Mobile-Sheet (top-right ist auf Mobile versteckt) */}
            <div className="flex justify-end mb-3 sm:hidden">
              <BeratungVereinbarenButton />
            </div>
            {wizardSlot}
          </div>
        </div>
      </div>

      {/* Map-Attribution + Powered-By unten rechts (subtil) */}
      <div className="hidden lg:block absolute bottom-3 right-3 z-[5] text-[10px] text-claimondo-navy/40">
        {t('attribution')}
      </div>

      {/* Schreibe HoveredId in den DOM für Server-Komponenten die das lesen wollen */}
      {hoveredId && <input type="hidden" data-selected-sv-id={hoveredId} />}
    </div>
  )
}
