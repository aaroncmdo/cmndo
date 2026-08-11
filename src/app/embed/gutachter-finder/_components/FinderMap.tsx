// Token-Audit-Skip: Mapbox-GL erwartet raw hex strings für marker fills + paint properties.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
'use client'

// AAR-956 WS1b — portiert aus claimondo-marketing/app/[locale]/gutachter-finden/
// GutachterFinderMapClient.tsx in die Haupt-App (Embed-Route /embed/gutachter-finder).
// next-intl → inline DE (Open-Decision #2); ansonsten visuell deckungsgleich.
// WS2 redesignt das Pin-Popup (+ GoogleBewertungBadge), WS3 Route/Zoom, WS4 füllt wizardSlot.
//
// AAR-956 (05.07.) — Einzel-SV-Ansicht (Route + Profil) wiederhergestellt.
// Coverage-Fläche = Union der Partner-Isochronen (glatter Außen-Umriss via
// unionIsochrones aus @/lib/mapbox/union-isochrones) + Dead-Pin-Heatmap.
// Beide Coverage-Layer bleiben als Kontext-Fläche sichtbar; die Einzel-SV-Ebene
// (klickbare Avatar-Marker + Profil-Popup/Sheet + Route) liegt DARÜBER.
//
// Anti-Skimming: Popup zeigt AUSSCHLIESSLICH anonyme Trust-Signale (Initiale,
// Region/Stadt, Specs, Bewertung, Vorname). KEINE PII: kein Telefon, keine Email,
// keine Adresse, kein Firmenname.

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState } from 'react'
// 2026-05-12: NICHT aus '@/lib/mapbox' (Index) importieren — der Index
// re-exportiert sv-car-3d-three (THREE.js am Top-Level) und cesium-3d-tiles,
// die sonst in den Public-Map-Bundle wandern. THREE.Color hat im minified
// Turbopack-Build den Constructor verloren → "i.Color is not a constructor"-
// Crash auf gutachter-finden. Direkter Import aus client.ts vermeidet das.
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import { fetchDrivingRoute } from '@/lib/mapbox/directions'
// Route-Feature (Aaron 17.07., werkstatt-embed-Lane): gerichteter Puls auf der bestehenden
// embed-route — hier REVERSE = fließt SV → Kunde (Geometrie ist Kunde→SV geordnet).
import { addPulsingFlow, type PulsingFlowHandle } from '@/lib/mapbox/pulsing-route'
import type { Map as MapboxMap, Marker, Popup, GeoJSONSource } from 'mapbox-gl'
import { ChevronUp } from 'lucide-react'
import type { SvLeadPublic, AktiverSVPublic } from '@/lib/actions/gutachter-finder-actions'
// AAR-glass-s1: Liquid-Glass-Design-System (siehe
// docs/superpowers/specs/2026-05-12-claimondo-glass-design-system.md).
import { GlassPill, BeratungVereinbarenButton, BeratungModal } from '@/components/shared/glass'
import { createRoot, type Root } from 'react-dom/client'
import { SvProfilePopup, DeadPinProfilePopup, SvProfileInhalt } from './SvProfilePopup'
import { istHervorgehobenerPartner } from './partner-pin'
import { empfehleSvFuerOrt } from '../actions'

type Props = {
  /** Tier-3 Lead-Partner (sv_leads). Dead-Pins, nicht klickbar, kein Popup. */
  svLeads: SvLeadPublic[]
  /** Tier-1 SVs (sachverstaendige). 2026-06-02 (Aaron): JEDER verifizierte,
   * aktive SV ist klickbar mit anonymem Profil-Popup (RLS-gegated). */
  aktiveSVs?: AktiverSVPublic[]
  /** Server-seitig vorberechnete Union der Partner-Isochronen (Perf: die ~10k-Vertex-
   * Isochronen wuerden sonst client-seitig via @turf/union unioniert -> Freeze). */
  coverageUnion?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null
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
  /** Test-Override (?fallback=1): erzwingt den Dead-Pin-Pfad in der Route-Empfehlung
   * (empfehleSvFuerOrt), damit der Dead-Pin-Flow live testbar ist. Vor Prod raus. */
  forceFallback?: boolean
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
// (ii) Netzwerkpartner-Highlight: Navigation-Gold (whitelisted in external-brand-colors.ts).
// NUR fuer relationale Partner (sv.imNetzwerk) am attribuierten Einstieg — s. partner-pin.ts.
const COL_GOLD = '#C9A84C'


// Generischer Dead-Pin (Claimondo-Logo-Look) — nicht klickbar, kein Hover,
// kein Popup. Wird für alle sv_leads (Tier-3 Excel-Imports) verwendet.
// Zweck: zeigt Marker-Dichte ohne SV-Identität.
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
  return marker
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
  // (ii) Relationale Partner-Prominenz: nur bei attribuiertem Einstieg (Werkstatt-/Gutachter-QR)
  // traegt der SV imNetzwerk=true → goldener Rahmen + Gold-Halo + Stern-Badge. Anon-Finder = neutral.
  const partner = istHervorgehobenerPartner(sv)
  const rand = partner ? COL_GOLD : COL_NAVY
  const schatten = partner
    ? '0 0 0 4px rgba(201,168,76,0.35),0 8px 20px rgba(13,27,62,0.28)'
    : '0 6px 18px rgba(13,27,62,0.22)'
  const sternBadge = partner
    ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:${COL_GOLD};border:2px solid #fff;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.25)"><span style="font-size:9px;line-height:1;color:#fff">&#9733;</span></div>`
    : ''
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  el.innerHTML = `
    <div class="sv-marker-inner" style="display:flex;flex-direction:column;align-items:center;transition:transform .35s cubic-bezier(.32,.72,0,1);transform-origin:center bottom">
      <div style="width:40px;height:40px;border-radius:50%;border:3px solid ${rand};background:#fff;display:grid;place-items:center;font-family:Montserrat,system-ui,sans-serif;font-size:15px;font-weight:800;color:${COL_NAVY};box-shadow:${schatten};position:relative">
        ${initiale}
        ${sternBadge}
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
  return marker
}

// DE-only Embed (AAR-956 Open-Decision #2): Map-Strings inline statt next-intl.
// Die Marketing-SEO-Seite bleibt ×6 lokalisiert; der Embed ist eine deutsche
// Claimondo-Fläche. Lokaler t-Shim hält die Call-Sites unverändert.
const MAP_STRINGS: Record<string, string> = {
  h1: 'Kfz-Gutachter in Ihrer Nähe finden.',
  sub: '4 kurze Fragen — wir verbinden Sie mit dem passenden Sachverständigen.',
  pill_near: '{count} Gutachter in Ihrer Nähe',
  pill_bundesweit: '{count} Gutachter bundesweit verfügbar',
  pill_short_near: '{count} Gutachter in Ihrer Nähe',
  pill_short_bundesweit: '{count} Gutachter verfügbar',
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

// AAR-956 (Aaron 14.06.): Haversine-Luftlinie (km) für den standortabhängigen
// „Gutachter in Ihrer Nähe"-Count.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// AAR-956 (Aaron 14.06.): Glass-Override für die Beratung-CTA (leicht transparent + blur,
// geräteübergreifend) — überschreibt die GlassButton-secondary-Defaults via gleicher
// Arbitrary-Properties (twMerge nimmt die letzte).
const BERATUNG_GLASS =
  '[background:color-mix(in_srgb,white_60%,transparent)] [backdrop-filter:blur(20px)_saturate(1.4)] [-webkit-backdrop-filter:blur(20px)_saturate(1.4)] border-white/50 text-claimondo-ondo'

// AAR-956 (Aaron 14.06.): Status-Pill als eigene Komponente — Desktop im Header (links), Mobil
// unten-mittig über dem Anfrage-Sheet. Responsiver Text via die zwei spans (kurz/voll).
function GutachterPill({
  userLocation,
  naeheCount,
  gesamt,
}: {
  userLocation: { lat: number; lng: number } | null
  naeheCount: number | null
  gesamt: number
}) {
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
        <span className="sm:hidden">
          {userLocation ? tMap('pill_short_near', { count: naeheCount ?? 0 }) : tMap('pill_short_bundesweit', { count: gesamt })}
        </span>
        <span className="hidden sm:inline">
          {userLocation ? tMap('pill_near', { count: naeheCount ?? 0 }) : tMap('pill_bundesweit', { count: gesamt })}
        </span>
      </span>
    </GlassPill>
  )
}

export function FinderMap({ svLeads, aktiveSVs = [], coverageUnion = null, wizardSlot, initialCenter = null, initialZoom, height = '100dvh', forceFallback = false }: Props) {
  const t = tMap
  const mapRef = useRef<MapboxMap | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markersRef = useRef<Marker[]>([])
  const popupRef = useRef<Popup | null>(null)
  const popupRootRef = useRef<Root | null>(null)
  const userMarkerRef = useRef<Marker | null>(null)
  const carMarkerRef = useRef<Marker | null>(null)
  const routePulseRef = useRef<PulsingFlowHandle | null>(null)
  // AAR-956 (Aaron 12.06.): die im Fallback gematchten Dead-Pins (15-km-Ghost-Isochrone) als
  // dynamische Pins — getrennt von markersRef (Partner), damit ich sie pro Ort neu setzen kann.
  const deadPinMarkersRef = useRef<Marker[]>([])
  // AAR-956 #4 (Aaron 12.06.): Marker-Elemente nach ID, um den GEWÄHLTEN Gutachter
  // hervorzuheben (Partner via svId, Dead-Pin via deadPinId) + letzter Ort für die Re-Route.
  const svMarkerElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const deadPinElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const lastOrtRef = useRef<{ lat: number; lng: number } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [beratungOpen, setBeratungOpen] = useState(false)
  // Aaron 04.07.: das Anfrage-Bottom-Sheet startet auf Mobil kosmetisch AUSGEFAHREN
  // (default expanded, überall — Embed / /start/makler / /start/werkstatt). Der Nutzer
  // sieht sofort die Anfrage-CTA; einklappen (Peek) geht per Chevron/Drag.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(true)
  // AAR-956 (Aaron 14.06.): SV-Profil als Bottom-Sheet auf Mobil/iPad (<lg) statt engem Pin-Popup.
  const [sheetSv, setSheetSv] = useState<AktiverSVPublic | null>(null)
  // AAR-956 (Aaron 14.06.): Touch-Start-Y fürs Drag-to-toggle des Anfrage-Bottom-Sheets.
  const sheetDragRef = useRef<number | null>(null)
  // AAR-956 (Aaron 14.06.): Live-Drag-Offset (px) fürs Anfrage-Sheet — folgt dem Finger.
  const [sheetDragY, setSheetDragY] = useState(0)
  const anfrageSheetRef = useRef<HTMLDivElement>(null)
  // AAR-956 (Aaron 14.06.): Live-Drag-to-close fürs Profil-Sheet (herunterziehen schließt, nicht
  // nur Klick auf den Strich) + Scroll-Lock (Hintergrund darf bei offenem Sheet nicht scrollen).
  const [profileDragY, setProfileDragY] = useState(0)
  const profileDragStartRef = useRef<number | null>(null)
  const profileSheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sheetSv) {
      setProfileDragY(0)
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sheetSv])
  // 2026-05-12 Aaron-Smoke: Wir fragen Geolocation beim Page-Load ab, damit
  // "In Ihrer Nähe"-Behauptung im Header ehrlich ist und die Karte direkt
  // zum User zoomt. Bei Deny bleibt es bei NRW-Mittelpunkt + neutralem Badge.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  // AAR-956 (Aaron 14.06.): standortabhängiger „Gutachter in Ihrer Nähe"-Count (geräteübergreifend):
  // aktive Gutachter, deren Umkreis den bekannten Ort deckt + Dead-Pins im 15-km-Radius.
  const loc = userLocation
  const naeheCount = loc
    ? aktiveSVs.filter(
        (s) =>
          s.standort_lat != null &&
          s.standort_lng != null &&
          haversineKm(loc.lat, loc.lng, s.standort_lat, s.standort_lng) <= (s.umkreis_km ?? 30),
      ).length + svLeads.filter((s) => haversineKm(loc.lat, loc.lng, s.lat, s.lng) <= 15).length
    : null
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
      language: 'de', // AAR-956 (Aaron 14.06.): Karten-Labels auf Deutsch (mapbox-gl v3 localization)
      center: startCenter,
      zoom: startZoom,
      pitch: 35,
      bearing: -8,
    })
    mapRef.current = map

    // AAR-956 (Aaron 12.06.): das Popup darf den Pin NICHT verdecken. Anchor + Offset so wählen,
    // dass das Popup in den freien Raum öffnet und der Pin frei bleibt:
    //   - Pin hinter der Wizard-Spalte (links) → nach RECHTS (anchor 'left')
    //   - Pin nah am oberen Rand → nach UNTEN (anchor 'top'), sonst clippt es oben weg
    //   - sonst → nach OBEN (anchor 'bottom') mit genug Offset, um den 40px-Avatar frei zu lassen
    function popupPlatzierung(lng: number, lat: number): {
      anchor: 'left' | 'top' | 'bottom'
      offset: [number, number]
    } {
      const p = map.project([lng, lat])
      const desktop = typeof window !== 'undefined' && window.innerWidth >= 1024
      if (desktop && p.x < 640) return { anchor: 'left', offset: [26, -6] }
      if (p.y < 300) return { anchor: 'top', offset: [0, 16] }
      return { anchor: 'bottom', offset: [0, -46] }
    }

    // WS2: Profil-Popup NEBEN/ÜBER dem Pin (popupPlatzierung) via React-Render
    // (createRoot + setDOMContent, Pattern wie DispatchKarteClient). View-only,
    // kein Wizard-CTA. Single-Popup: alter Popup + Root werden vorher entsorgt.
    function openSvPopup(sv: AktiverSVPublic, opts?: { mobilSheet?: boolean }) {
      popupRef.current?.remove()
      popupRootRef.current?.unmount()
      // AAR-956 (Aaron 14.06.): Mobil/iPad (<lg) → Bottom-Sheet NUR bei direktem Pin-Klick
      // (opts.mobilSheet). Auto-Open (empfohlener SV nach Route) + Slot-Picker-Select öffnen
      // auf Mobil NICHTS — ein Sheet würde sonst den Slot-Picker verdecken. Desktop (≥1024)
      // behält in allen Fällen das Map-Popup.
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        if (opts?.mobilSheet) {
          setSheetSv(sv)
          setHoveredId(sv.id)
        }
        return
      }
      const container = document.createElement('div')
      const root = createRoot(container)
      root.render(<SvProfilePopup sv={sv} />)
      const { anchor, offset } = popupPlatzierung(sv.standort_lng, sv.standort_lat)
      const popup = new mapboxgl.Popup({
        offset,
        closeButton: true,
        maxWidth: '340px',
        anchor,
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

    // Light-Profil-Popup für den empfohlenen Dead-Pin (Aaron 12.06.: SELBER Wrapper wie das
    // SV-Profil). React-Render via createRoot/setDOMContent (wie openSvPopup) — leak-safe
    // <DeadPinProfilePopup> (kein Name/Profil/Reviews), nur „Kfz-Gutachter in {ort}" + Hinweis,
    // in derselben GlassSurface-Shell. Anti-Wizard-Overlap-Anchor wie openSvPopup.
    function openDeadPinPopup(lng: number, lat: number, ort: string | null) {
      popupRef.current?.remove()
      popupRootRef.current?.unmount()
      // AAR-956 (Aaron 14.06.): Mobil/iPad (<lg) → KEIN enges Map-Popup für Dead-Pins —
      // exakt wie bei den aktiven SVs (openSvPopup). Der Wizard zeigt den Dead-Pin-Slot-Step;
      // ein Popup würde auf Mobil nur die Karte verdecken. Desktop (≥1024) behält das Popup.
      if (typeof window !== 'undefined' && window.innerWidth < 1024) return
      const container = document.createElement('div')
      const root = createRoot(container)
      root.render(<DeadPinProfilePopup ort={ort} />)
      const { anchor, offset } = popupPlatzierung(lng, lat)
      const popup = new mapboxgl.Popup({
        offset,
        closeButton: true,
        maxWidth: '340px',
        anchor,
        className: 'sv-finder-popup',
      })
        .setLngLat([lng, lat])
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

    // Nur echte Auth-/Token-Fehler (401/403) loggen + sichtbar machen. Transiente
    // Mapbox-'error'-Events (geblockte Telemetry/events.mapbox.com, Tile-Hiccups)
    // feuern "nach einiger Zeit" obwohl die Karte laeuft — die NICHT mehr als
    // Karten-Fehler loggen/anzeigen (Aaron 16.06.).
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
      map.resize() // 2026-05-12: nochmal resize beim load, falls der Container zwischenzeitlich gewachsen ist

      // ── Dead-Pin-Reichweite (heller, UNTEN) — als weiche Heatmap-Wolke statt harter
      //    15-km-Kreise (die stapeln sich fleckig übereinander). Reine Optik: der
      //    Abdeckungs-/Nearest-SV-Check laeuft server-seitig (empfehleSvFuerOrt).
      //    Flacher Farbverlauf → gleichmäßige helle Fläche, kein Hotspot-Look.
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

      // ── Partner-Einsatzgebiet (kräftig, OBEN) — server-seitig vorberechnete Union ──
      // Perf: die ~10k-Vertex-Isochronen werden in page.tsx (Server) via @turf/union
      // zu EINER Flaeche vereint + als coverageUnion-Prop gereicht -> kein Client-turf.
      if (coverageUnion) {
        const coveragePartnersData: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{ ...coverageUnion, properties: {} }],
        }
        map.addSource('coverage-partners', { type: 'geojson', data: coveragePartnersData })
        map.addLayer({
          id: 'coverage-partners-fill',
          type: 'fill',
          source: 'coverage-partners',
          paint: { 'fill-color': COL_ONDO, 'fill-opacity': 0.16 },
        })
        map.addLayer({
          id: 'coverage-partners-outline',
          type: 'line',
          source: 'coverage-partners',
          // Union → nur noch der glatte Außen-Umriss (keine inneren SV-Grenzen mehr).
          paint: { 'line-color': COL_ONDO, 'line-width': 2, 'line-opacity': 0.55 },
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
      svMarkerElsRef.current.clear()
      aktiveSVs.forEach((sv) => {
        const marker = addClickableMarker(map, markersRef.current, sv, () => openSvPopup(sv, { mobilSheet: true }))
        svMarkerElsRef.current.set(sv.id, marker.getElement())
      })

      // ─── Tier-3 sv_leads — als Dead-Pins gerendert (Aaron 12.06.: „die Dead-Pins müssen
      // trotzdem gerendert werden"). Die 15-km-Ghost-Isochrone filtert NUR die Buchung + das
      // Route-Ziel, NICHT die Karten-Darstellung. El nach ID (= sv_leads.id = deadPinId)
      // merken → den gematchten/gewählten Dead-Pin hervorheben.
      deadPinElsRef.current.clear()
      svLeads.forEach((sv) => {
        const m = addDeadPin(map, deadPinMarkersRef.current, sv.lng, sv.lat)
        deadPinElsRef.current.set(sv.id, m.getElement())
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
          // "Sie sind hier"-Marker — nur nach Geolocation-Consent sichtbar (Aaron 11.06.).
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
        },
        (err) => {
          console.info('[gutachter-finden] Geolocation verweigert/Fehler:', err.message)
        },
        { timeout: 8000, maximumAge: 60_000 },
      )
    }

    // AAR-956 #4: gewählten Gutachter hervorheben — Klasse aufs Marker-Element (Partner ODER
    // Dead-Pin, gegenseitig exklusiv). CSS-Regeln im <style>-Block unten.
    function highlightSv(svId: string | null) {
      svMarkerElsRef.current.forEach((el, id) => el.classList.toggle('sv-marker-selected', id === svId))
      deadPinElsRef.current.forEach((el) => el.classList.remove('deadpin-selected'))
    }
    function highlightDeadPin(deadPinId: string | null) {
      deadPinElsRef.current.forEach((el, id) => el.classList.toggle('deadpin-selected', id === deadPinId))
      svMarkerElsRef.current.forEach((el) => el.classList.remove('sv-marker-selected'))
    }

    // AAR-956 #4: Fahr-Route vom Besichtigungsort zum Ziel + Kamera + onArrive (Popup). EINE
    // Quelle für die Erst-Empfehlung (handleEmbedOrt) UND die spätere Auswahl (handleSvSelected).
    function routeToTarget(
      originLng: number,
      originLat: number,
      zielLng: number,
      zielLat: number,
      onArrive: () => void,
    ) {
      void fetchDrivingRoute([originLng, originLat], [zielLng, zielLat]).then(({ primary }) => {
        if (!mapRef.current) return
        const data: GeoJSON.Feature = {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: primary.coords as Array<[number, number]> },
          properties: {},
        }
        const src = map.getSource('embed-route') as GeoJSONSource | undefined
        if (src) {
          src.setData(data)
        } else {
          // lineMetrics: true → Voraussetzung für den `line-gradient`-Puls (addPulsingFlow).
          map.addSource('embed-route', { type: 'geojson', lineMetrics: true, data })
          // Weiße Casing zuerst (darunter) → die Route hebt sich prägnant von der Karte ab.
          map.addLayer({
            id: 'embed-route-casing',
            type: 'line',
            source: 'embed-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 11, 'line-opacity': 0.95 },
          })
          map.addLayer({
            id: 'embed-route-line',
            type: 'line',
            source: 'embed-route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': COL_ONDO,
              'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 13, 6, 16, 8],
              'line-opacity': 1,
            },
          })
        }
        // Gerichteter heller Puls OBEN auf der Route — REVERSE = fließt Ziel→Origin = SV→Kunde.
        // Alten Puls-rAF zuerst stoppen (Re-Route ruft routeToTarget erneut) → kein rAF-Leak.
        routePulseRef.current?.remove()
        routePulseRef.current = addPulsingFlow(map, {
          sourceId: 'embed-route',
          layerId: 'embed-route-pulse',
          color: '#ffffff',
          direction: 'reverse',
          width: ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 5, 16, 7],
        })
        const bounds = new mapboxgl.LngLatBounds([originLng, originLat], [originLng, originLat]).extend([zielLng, zielLat])
        const leftPad = typeof window !== 'undefined' && window.innerWidth >= 1024 ? 470 : 48
        map.fitBounds(bounds, { padding: { top: 90, bottom: 110, left: leftPad, right: 70 }, duration: 1400, maxZoom: 13.5 })
        // Popup des Ziels öffnen, sobald Route + Kamera stehen (moveend → finale Pin-Position
        // für den Anti-Wizard-Overlap-Anchor).
        map.once('moveend', () => {
          if (!mapRef.current) return
          onArrive()
        })
      })
    }

    // Auto-Marker + Zoom, sobald der Wizard den Besichtigungsort kennt (Aaron 11.06.):
    // der Wizard dispatcht claimondo:embed-ort {lat,lng} → Navy-Auto-Pin ans Fahrzeug + flyTo.
    function handleEmbedOrt(e: Event) {
      const ce = e as CustomEvent<{ lat?: number; lng?: number }>
      const lat = ce.detail?.lat
      const lng = ce.detail?.lng
      if (typeof lat !== 'number' || typeof lng !== 'number') return
      carMarkerRef.current?.remove()
      const carEl = document.createElement('div')
      carEl.setAttribute('aria-label', 'Fahrzeug-Standort')
      carEl.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="width:40px;height:40px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0D1B3E;border:3px solid #fff;box-shadow:0 6px 18px rgba(13,27,62,0.35);display:grid;place-items:center">
            <div style="transform:rotate(45deg);display:grid;place-items:center">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 1 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
            </div>
          </div>
        </div>
      `
      carMarkerRef.current = new mapboxgl.Marker({ element: carEl, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
      lastOrtRef.current = { lat, lng }
      // AAR-956 (Aaron 14.06.): eingegebener Ort steuert die „Gutachter in Ihrer Nähe"-Pill
      // (geräteübergreifend) → der Count reagiert auf den Standort.
      setUserLocation({ lat, lng })

      // WS3 (Aaron 12.06.): Route-Ziel DISKRIMINIERT — Partner ODER Dead-Pin (Fallback).
      // empfehleSvFuerOrt liefert {kind}: partner → Pin aus aktiveSVs + Profil-Popup;
      // deadpin (0 buchbare Partner) → dessen Koordinate + Lite-Popup (leak-safe);
      // none → flyTo. KEIN Distanz-Proxy-über-Partner mehr (der war die Ursache, dass
      // im Fallback immer ein ferner Partner statt der Dead-Pin geroutet wurde).
      // forceFallback (?fallback=1) erzwingt den Dead-Pin-Pfad (Test).
      void empfehleSvFuerOrt({ lat, lng, forceFallback }).then((ziel) => {
        if (!mapRef.current) return
        if (ziel.kind === 'partner') {
          const sv = aktiveSVs.find((s) => s.id === ziel.svId) ?? null
          if (!sv) {
            map.flyTo({ center: [lng, lat], zoom: 13, duration: 1400, essential: true })
            return
          }
          routeToTarget(lng, lat, sv.standort_lng, sv.standort_lat, () => {
            highlightSv(sv.id)
            openSvPopup(sv)
          })
        } else if (ziel.kind === 'deadpin') {
          // Die Dead-Pins sind bereits gerendert (Baseline). Route + Light-Popup zum nächsten
          // DECKENDEN (deadPins[0], 15-km-Isochrone, nach Distanz) + diesen hervorheben.
          const naechster = ziel.deadPins[0]
          if (!naechster) {
            map.flyTo({ center: [lng, lat], zoom: 13, duration: 1400, essential: true })
            return
          }
          routeToTarget(lng, lat, naechster.lng, naechster.lat, () => {
            highlightDeadPin(naechster.deadPinId)
            openDeadPinPopup(naechster.lng, naechster.lat, naechster.ort)
          })
        } else {
          map.flyTo({ center: [lng, lat], zoom: 13, duration: 1400, essential: true })
        }
      })
    }
    document.addEventListener('claimondo:embed-ort', handleEmbedOrt)

    // AAR-956 #4 (Aaron 12.06.): der Nutzer wählt im Booking einen Gutachter → Karte routet
    // dorthin + hebt ihn hervor. Partner via svId (aus aktiveSVs), Dead-Pin via Koordinate.
    function handleSvSelected(e: Event) {
      const detail = (e as CustomEvent<{ kind?: string; svId?: string; deadPinId?: string; lat?: number; lng?: number; ort?: string | null }>).detail
      const ort = lastOrtRef.current
      if (!ort || !mapRef.current || !detail) return
      if (detail.kind === 'partner' && typeof detail.svId === 'string') {
        const sv = aktiveSVs.find((s) => s.id === detail.svId) ?? null
        if (!sv) return
        routeToTarget(ort.lng, ort.lat, sv.standort_lng, sv.standort_lat, () => {
          highlightSv(sv.id)
          openSvPopup(sv)
        })
      } else if (detail.kind === 'deadpin' && typeof detail.lat === 'number' && typeof detail.lng === 'number') {
        const dLng = detail.lng
        const dLat = detail.lat
        const dOrt = detail.ort ?? null
        const dId = detail.deadPinId ?? null
        routeToTarget(ort.lng, ort.lat, dLng, dLat, () => {
          highlightDeadPin(dId)
          openDeadPinPopup(dLng, dLat, dOrt)
        })
      }
    }
    document.addEventListener('claimondo:embed-sv-selected', handleSvSelected)

    return () => {
      window.clearTimeout(loadTimeout)
      document.removeEventListener('claimondo:embed-ort', handleEmbedOrt)
      document.removeEventListener('claimondo:embed-sv-selected', handleSvSelected)
      resizeObs.disconnect()
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      deadPinMarkersRef.current.forEach((m) => m.remove())
      deadPinMarkersRef.current = []
      svMarkerElsRef.current.clear()
      deadPinElsRef.current.clear()
      userMarkerRef.current?.remove()
      carMarkerRef.current?.remove()
      routePulseRef.current?.remove()
      popupRootRef.current?.unmount()
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
    // AAR-956 Fix: Karte NUR einmal (mount) initialisieren. Mit [svLeads] lief der
    // Effekt nach jedem Server-Action-Refresh (Buchung → RSC-Refresh → neue svLeads-Ref)
    // neu → Cleanup map.remove() → Route + Fahrzeug-Pin weg. svLeads/aktiveSVs sind im
    // Embed statisch (server-once geladen), also ist [] korrekt (kein Marker-Verlust).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="relative w-full" style={{ height }}>
      {/* WS2 (Glass-Popup): Mapbox-Popup-Wrapper transparent stellen, damit die
          GlassCard die Oberfläche ist (kein weisser Default-Kasten), Tip aus,
          Close-Button als runder Navy-Button. Scoped via .sv-finder-popup. */}
      <style>{`
        .sv-finder-popup .mapboxgl-popup-content {
          background: transparent;
          padding: 0;
          box-shadow: none;
          border-radius: var(--glass-radius-card);
        }
        .sv-finder-popup.mapboxgl-popup { z-index: 12; }
        .sv-finder-popup .mapboxgl-popup-tip { display: none; }
        .sv-finder-popup .mapboxgl-popup-close-button {
          top: 10px;
          right: 10px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          color: var(--claimondo-navy, #0D1B3E);
          font-size: 16px;
          line-height: 1;
          z-index: 3;
          transition: background 0.15s ease;
        }
        .sv-finder-popup .mapboxgl-popup-close-button:hover {
          background: color-mix(in srgb, var(--claimondo-navy, #0D1B3E) 8%, transparent);
        }
        @keyframes gf-user-pulse {
          0% { transform: scale(0.5); opacity: 0.55; }
          80%, 100% { transform: scale(1.9); opacity: 0; }
        }
        /* AAR-956 #4: der gewählte Gutachter ist hervorgehoben (Marker größer + Ondo-Ring). */
        .sv-marker-selected .sv-marker-inner { transform: scale(1.28); z-index: 5; }
        .sv-marker-selected .sv-marker-inner > div {
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--claimondo-ondo, #4573A2) 38%, transparent), 0 8px 22px rgba(13,27,62,0.34);
        }
        .deadpin-selected .sv-deadpin {
          transform: scale(1.5);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--claimondo-ondo, #4573A2) 38%, transparent), 0 4px 12px rgba(13,27,62,0.4);
        }
        /* Google-Places-Dropdown (.pac-container) in unsere Tokens bringen. Google
           rendert es an document.body → global; greift nur solange der Embed gemountet
           ist. Doppelklasse = höhere Spezifität als Googles Default-Stylesheet.
           "powered by Google" (::after) bleibt erhalten (Places-ToS). */
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
            'linear-gradient(100deg, color-mix(in srgb, var(--glass-tint-soft) 80%, transparent) 0%, color-mix(in srgb, var(--glass-tint-soft) 52%, transparent) 38%, color-mix(in srgb, var(--glass-tint-soft) 22%, transparent) 64%, transparent 92%)',
          backdropFilter: 'blur(22px) saturate(1.05)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.05)',
          maskImage: 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,.35) 80%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, #000 0%, #000 60%, rgba(0,0,0,.35) 80%, transparent 100%)',
        }}
      />

      {/* Hero-Header oben — Status-Glass-Pill links, Beratung-CTA rechts (full-bleed).
          Mobile: kurzer Pill-Text + Beratung als Icon-only-Pill, sonst läuft's über. */}
      <div className="absolute top-0 left-0 right-0 z-[5] px-3 pt-3 sm:px-6 sm:pt-6 pointer-events-none">
        <div className="flex items-center justify-end sm:justify-between gap-2 pointer-events-auto">
          {/* AAR-956 (Aaron 14.06.): Pill nur Desktop im Header — Mobil unten-mittig (s.u.). */}
          <div className="hidden sm:block">
            <GutachterPill userLocation={userLocation} naeheCount={naeheCount} gesamt={aktiveSVs.length + svLeads.length} />
          </div>
          {/* AAR-glass-s1: Permanenter Beratungs-CTA oben rechts. Auf Mobile
              kürzeres Label ("Beratung") damit's neben dem Status-Pill passt. */}
          <BeratungVereinbarenButton onClick={() => setBeratungOpen(true)} className={`hidden sm:inline-flex ${BERATUNG_GLASS}`} />
          <BeratungVereinbarenButton onClick={() => setBeratungOpen(true)} label={t('beratung_label')} className={`sm:hidden flex-shrink-0 text-[12px] px-3 ${BERATUNG_GLASS}`} />
        </div>
      </div>

      {/* AAR-956 (Aaron 14.06.): Status-Pill auf Mobil unten-mittig über dem Anfrage-Sheet
          (nicht oben links) — ausgeblendet wenn das Sheet offen ist. Desktop = Header (s.o.). */}
      {!mobileSheetOpen && (
        <div className="sm:hidden pointer-events-none absolute inset-x-0 bottom-[72px] z-[8] flex justify-center">
          <GutachterPill userLocation={userLocation} naeheCount={naeheCount} gesamt={aktiveSVs.length + svLeads.length} />
        </div>
      )}

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

      {/* Mobile Bottom-Sheet (AUSGEFAHREN by default — Aaron 04.07.; einklappen per Chevron/Drag).
          AAR-glass-s1: Glass-Tokens statt hartkodierter bg-white/85. */}
      {/* Mobile Bottom-Sheet — AAR-956 (Aaron 14.06.): EINE Glass-Fläche (leicht transparent +
          backdrop-blur), draggable, nur der Chevron als Affordance. Grab-Strich + „Anfrage
          starten"-Text raus (redundant — der Pfeil suggeriert das Öffnen). Header transparent +
          innere Wizard-Card transparent ([&>div]-Override, NUR hier mobil → Desktop-Card bleibt
          Glass) → keine gestapelten Glass-Schichten mehr. */}
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
              // offen → nur nach unten (bis Peek); Peek → nur nach oben (bis offen). Clamp an die
              // ECHTE Sheet-Höhe (− 56px Peek), damit es nicht weiter als nötig zieht (Aaron 14.06.).
              const maxDrag = Math.max(0, (anfrageSheetRef.current?.offsetHeight ?? 600) - 56)
              setSheetDragY(mobileSheetOpen ? Math.max(0, Math.min(dy, maxDrag)) : Math.min(0, Math.max(dy, -maxDrag)))
            }}
            onTouchEnd={(e) => {
              const start = sheetDragRef.current
              sheetDragRef.current = null
              setSheetDragY(0)
              if (start == null) return
              e.preventDefault() // Click-Synthese nach Touch unterdrücken (sonst Doppel-Toggle)
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
            {/* AAR-956 (Aaron 14.06.): KEIN zweiter Beratungs-CTA im Anfrage-Sheet — der
                Header-Button oben rechts (auch auf Mobile sichtbar) reicht. Doppelung raus. */}
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

      {/* AAR-956 (Aaron 14.06.): SV-Profil als Bottom-Sheet auf Mobil/iPad (<lg) — von unten
          ausfahrbar, mehr Platz + Touch-freundlich als das enge Pin-Popup. Avatar + Sterne +
          Trust-Signale (gross-Variante). Desktop (≥1024) nutzt weiterhin das Map-Popup. */}
      {sheetSv && (
        <div className="lg:hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Gutachter-Profil">
          <div
            className="absolute inset-0 backdrop-blur-sm animate-in fade-in"
            style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary, #0D1B3E) 22%, transparent)' }}
            onClick={() => {
              setSheetSv(null)
              setHoveredId(null)
            }}
          />
          <div
            ref={profileSheetRef}
            onTouchStart={(e) => {
              // Drag-to-close nur initiieren, wenn der Inhalt oben steht — sonst scrollt der Inhalt.
              if ((profileSheetRef.current?.scrollTop ?? 0) <= 0) profileDragStartRef.current = e.touches[0].clientY
            }}
            onTouchMove={(e) => {
              if (profileDragStartRef.current === null) return
              const dy = e.touches[0].clientY - profileDragStartRef.current
              if (dy > 0) setProfileDragY(dy) // nur nach unten
            }}
            onTouchEnd={() => {
              if (profileDragY > 90) {
                setSheetSv(null)
                setHoveredId(null)
              }
              setProfileDragY(0)
              profileDragStartRef.current = null
            }}
            style={{
              transform: profileDragY ? `translateY(${profileDragY}px)` : undefined,
              transition: profileDragStartRef.current !== null ? 'none' : 'transform 0.25s ease-out',
            }}
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto overscroll-contain rounded-t-ios-xl border-t border-white/50 bg-white/70 shadow-glass-card backdrop-blur-xl animate-in slide-in-from-bottom duration-300"
          >
            <button
              type="button"
              onClick={() => {
                setSheetSv(null)
                setHoveredId(null)
              }}
              aria-label="Profil schließen"
              className="sticky top-0 z-10 flex w-full justify-center pt-2.5 pb-2"
            >
              <span className="block h-1 w-10 rounded-full bg-claimondo-navy/25" />
            </button>
            <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <SvProfileInhalt sv={sheetSv} gross />
            </div>
          </div>
        </div>
      )}

      {/* Beratung-Rückruf-Modal auf Root-Ebene (NICHT im z-[5]-Header). Sonst bleibt die
          z-[10]-Sidebar ÜBER dem Modal-Backdrop "hervorgehoben" — das fixed-Modal wäre im
          Header-Stacking-Context gefangen. Hier escaped es + deckt das ganze Overlay ab. */}
      <BeratungModal open={beratungOpen} onClose={() => setBeratungOpen(false)} quelle="embed-gutachter-finder" />
    </div>
  )
}
