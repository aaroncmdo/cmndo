'use client'

// AAR-122: Karte als Hub — SVs + Communities + Organisationen als Layer
// Drei Filter-Chips oberhalb der Karte, drei Marker-Farben, ein gemeinsames
// Detail-Panel rechts. Communities/Orgs leiten auf ihre vollen Listing-Pages
// weiter (Deep-Links bleiben erreichbar, Nav-Items sind konsolidiert).
// AAR-xxx: Mapbox GL JS v3 ersetzt Google Maps — 3D-Gebäude + Standard-Style.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CarFrontIcon, ShieldCheckIcon, Building2Icon, UserPlusIcon,
  XIcon, MapPinIcon, ArrowRightIcon, LayersIcon, RefreshCwIcon, SearchIcon,
} from 'lucide-react'
import { recalculateIsochrone } from './actions'
import { createClient } from '@/lib/supabase/client'
import { getSvStatus } from '@/lib/sv-status'
import NeuSvDrawer from '../NeuSvDrawer'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox/client'
import type { Map as MapboxMap, Marker as MapboxMarker, GeoJSONSource as MapboxGeoJSONSource } from 'mapbox-gl'

// AAR-130: GeoJSON-Polygon als optionales Feld auf jedem Marker
export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] } | null

export type SvMarker = {
  id: string
  name: string
  paket: string | null
  lat: number | null
  lng: number | null
  istAktiv: boolean
  isochrone?: GeoPolygon
  einsatzKm?: number | null
  // AAR-131: Sidebar-Felder (aus altem KarteClient migriert)
  gutachterTyp?: string | null
  offeneFaelle?: number
  maxFaelleMonat?: number
  ablehnungen30Tage?: number
  portalZugangFreigeschaltet?: boolean | null
  vertragUnterschrieben?: boolean | null
  gesperrtSeit?: string | null
  // AAR-659: Dispatch-Blockers + Quali-Signale (Urlaub, SA-Vorlage, Verifizierung, Ausweis-Nummern, Notizen)
  urlaubVon?: string | null
  urlaubBis?: string | null
  verifiziert?: boolean | null
  saVorlageStatus?: string | null
  bvskNr?: string | null
  ihkNr?: string | null
  oebuvNr?: string | null
  notizen?: string | null
}

export type CommunityMarker = {
  id: string
  name: string
  exklusiv: boolean
  maxFaelle: number | null
  lat: number | null
  lng: number | null
  isochrone?: GeoPolygon
  einsatzKm?: number | null
}

export type OrgMarker = {
  id: string
  name: string
  typ: 'buero' | 'akademie'
  lat: number | null
  lng: number | null
  isochrone?: GeoPolygon
  einsatzKm?: number | null
}

// Layer-Farben (AAR-122 Spec)
const LAYER = {
  sv: { fill: '#4573A2', label: 'Sachverständige', icon: CarFrontIcon },
  community: { fill: '#10b981', label: 'Communities', icon: ShieldCheckIcon },
  org: { fill: '#f59e0b', label: 'Organisationen', icon: Building2Icon },
} as const

// AAR-131: 4 SV-Typ-Farben (aus altem KarteClient migriert).
// Wird auf Marker + Sidebar-Liste angewendet wenn der SV-Layer aktiv ist.
const TYP_COLORS: Record<string, { fill: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', label: 'DAT' },
  akademie: { fill: '#22c55e', label: 'Akademie' },
  gutachterbuero: { fill: '#a855f7', label: 'Büro' },
}

// AAR-131: Paket-Label-Legacy-Mapping (alte Keys aus DB konsistent darstellen)
const PAKET_LABEL: Record<string, string> = {
  'starter-10': 'Standard', standard: 'Standard',
  'standard-25': 'Pro', pro: 'Pro',
  'premium-50': 'Premium', premium: 'Premium',
}

// AAR-audit: "onboarding" ergänzt damit SVs die Vertrag unterzeichnet haben
// aber noch auf Anzahlung / Portal-Freischaltung warten gezielt gefiltert
// werden können. Vorher wurden sie im „Aktiv"-Filter versteckt (Kriterium
// war nur ist_aktiv+gesperrt_seit) und waren zwischen 20+ anderen SVs
// unsichtbar — obwohl das Dashboard-Widget „Ausstehende Anzahlung" sie
// eindeutig als handlungsbedürftig markiert.
// AAR SV-Audit-Konsolidierung: „deaktivierte" gestrichen — `ist_aktiv=false`
// bedeutet nun „noch im Onboarding" (Stripe noch nicht durch). Der Admin-
// manuelle Toggle läuft über `gesperrt_seit`. Dadurch reicht: aktiv /
// onboarding / gesperrt / alle.
type SvStatusFilter = 'aktive' | 'onboarding' | 'gesperrt' | 'alle'

const OVERLAY_LAYERS = ['sv', 'community', 'org'] as const

type Selected =
  | { kind: 'sv'; item: SvMarker }
  | { kind: 'community'; item: CommunityMarker }
  | { kind: 'org'; item: OrgMarker }
  | null

export default function KarteHubClient({
  svs,
  communities,
  organisationen,
}: {
  svs: SvMarker[]
  communities: CommunityMarker[]
  organisationen: OrgMarker[]
}) {
  const router = useRouter()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const markersRef = useRef<MapboxMarker[]>([])
  // Click-Handler pro Entity-ID — wird in Overlay-Effect befüllt, im Map-Init konsumiert
  const polygonClickHandlersRef = useRef<Map<string, () => void>>(new Map())
  // AAR-131 (KFZ-158): Live-Marker für unterwegs-SVs separat tracken
  const liveMarkersRef = useRef<Map<string, MapboxMarker>>(new Map())
  const [mapReady, setMapReady] = useState(false)

  const [showSvs, setShowSvs] = useState(true)
  const [showCommunities, setShowCommunities] = useState(true)
  const [showOrgs, setShowOrgs] = useState(true)
  // AAR-130: Default off — Polygone werden auf Wunsch eingeblendet
  const [showOverlays, setShowOverlays] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)

  // AAR-131 + AAR-151: SV-Sidebar State (Suche + Status-Filter + Typ-Filter).
  // AAR-151 Anpassung: Typ-Filter ist jetzt Single-Select-Chip-Row mit 5
  // Optionen (Alle + 4 Typen) statt Multi-Toggle-Set — matcht die Spec-UI
  // und vereinfacht die Semantik („Alle" zeigt alles, sonst genau 1 Typ).
  const [search, setSearch] = useState('')
  const [svFilter, setSvFilter] = useState<SvStatusFilter>('aktive')
  const [typFilter, setTypFilter] = useState<string | null>(null) // null = Alle
  // AAR-151: NeuSvDrawer (Slide-out) statt Navigation zur alten /neu-Page
  const [drawerOpen, setDrawerOpen] = useState(false)

  // AAR-131 + AAR-151: gefilterte SVs für Sidebar + Marker.
  // typFilter=null → kein Typ-Filter aktiv; sonst genau dieser gutachter_typ.
  // AAR-audit: "onboarding" = SVs die noch keinen Portal-Zugang haben (egal
  // ob Vertrag schon unterzeichnet ist oder nicht). Deckt sich mit dem was
  // das Ausstehende-Anzahlung-Widget als Zielgruppe hat.
  const filteredSvs = useMemo(() => {
    return svs.filter((sv) => {
      // AAR SV-Audit-Konsolidierung: Status-Bucket anhand der 3 Konditionen:
      //   gesperrt_seit IS NOT NULL → gesperrt (höchste Prio)
      //   !portal_zugang_freigeschaltet ODER !ist_aktiv → onboarding
      //   sonst → aktiv
      const istGesperrt = !!sv.gesperrtSeit
      const istOnboarding = !istGesperrt && (sv.portalZugangFreigeschaltet !== true || sv.istAktiv === false)
      if (svFilter === 'gesperrt' && !istGesperrt) return false
      if (svFilter === 'aktive' && (istGesperrt || istOnboarding)) return false
      if (svFilter === 'onboarding' && !istOnboarding) return false
      if (typFilter && (sv.gutachterTyp ?? 'kfz-gutachter') !== typFilter) return false
      if (search && !sv.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [svs, svFilter, typFilter, search])

  // ─── Map init (einmalig) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return

    const ok = ensureMapboxInitialized()
    if (!ok) return

    // AAR-661: Vogelperspektive statt Globe — projection: 'mercator' flacht
    // die Erdkrümmung ab, leichter Pitch + minimales Bearing erhält eine
    // dezente 3D-Anmutung ohne die alte Weltkugel-Optik.
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      projection: 'mercator',
      center: [10.4515, 51.1657],
      zoom: 5.8,
      pitch: 35,
      bearing: 0,
      antialias: true,
    }) as MapboxMap

    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('load', () => {
      // 3D-Gebäude + Atmosphäre im Mapbox Standard-Style aktivieren
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(map as any).setConfigProperty('basemap', 'lightPreset', 'day')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(map as any).setConfigProperty('basemap', 'show3dObjects', true)
      } catch {
        // Standard-Style-Config optional — kein harter Fehler
      }

      // GeoJSON-Quellen + Layer für Isochrone-Overlays (SV / Community / Org)
      for (const layer of OVERLAY_LAYERS) {
        map.addSource(`${layer}-overlays`, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          generateId: true,
        })
        // AAR-661: fill-extrusion statt flat fill — gibt Isos eine leichte 3D-
        // Kuppel. Höhe skaliert dezent (500 m Base, 2500 m Hover) damit sie
        // in der Vogelperspektive sichtbar werden ohne die Karte zu erschlagen.
        map.addLayer({
          id: `${layer}-overlays-fill`,
          type: 'fill-extrusion',
          source: `${layer}-overlays`,
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-opacity': 0.35,
            'fill-extrusion-height': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              2500,
              800,
            ],
            'fill-extrusion-base': 0,
            'fill-extrusion-vertical-gradient': true,
          },
        })
        map.addLayer({
          id: `${layer}-overlays-line`,
          type: 'line',
          source: `${layer}-overlays`,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              3,
              1.8,
            ],
            'line-opacity': 0.7,
          },
        })
      }

      // Hover-State pro Overlay-Layer
      const hoverState: Record<string, number | string | null> = { sv: null, community: null, org: null }

      for (const layer of OVERLAY_LAYERS) {
        const fillId = `${layer}-overlays-fill`
        const src = `${layer}-overlays`

        map.on('mousemove', fillId, (e) => {
          map.getCanvas().style.cursor = 'pointer'
          const fid = e.features?.[0]?.id
          if (hoverState[layer] !== null && hoverState[layer] !== fid) {
            map.setFeatureState({ source: src, id: hoverState[layer]! }, { hover: false })
          }
          hoverState[layer] = fid ?? null
          if (fid !== undefined && fid !== null) {
            map.setFeatureState({ source: src, id: fid }, { hover: true })
          }
        })

        map.on('mouseleave', fillId, () => {
          map.getCanvas().style.cursor = ''
          if (hoverState[layer] !== null) {
            map.setFeatureState({ source: src, id: hoverState[layer]! }, { hover: false })
            hoverState[layer] = null
          }
        })

        map.on('click', fillId, (e) => {
          const entityId = e.features?.[0]?.properties?.entityId as string | undefined
          if (entityId) polygonClickHandlersRef.current.get(entityId)?.()
        })
      }

      setMapReady(true)
    })

    return () => {
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ─── Marker render (dep: showSvs/Communities/Orgs + Daten) ────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current

    // Alte Marker entfernen
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    function makeCircleEl(color: string, sizePx: number, title: string): HTMLDivElement {
      const el = document.createElement('div')
      el.style.cssText = [
        `width:${sizePx}px`,
        `height:${sizePx}px`,
        `background:${color}`,
        'border:2.5px solid #fff',
        'border-radius:50%',
        'cursor:pointer',
        'box-shadow:0 1px 5px rgba(0,0,0,.35)',
        'transition:transform .15s',
      ].join(';')
      el.title = title
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.25)' })
      el.addEventListener('mouseleave', () => { el.style.transform = '' })
      return el
    }

    function addMarker(
      lng: number,
      lat: number,
      color: string,
      sizePx: number,
      title: string,
      onClick: () => void,
    ) {
      const el = makeCircleEl(color, sizePx, title)
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick() })
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map) as MapboxMarker
      markersRef.current.push(marker)
    }

    if (showSvs) {
      for (const sv of filteredSvs) {
        if (sv.lat == null || sv.lng == null) continue
        const color = sv.istAktiv
          ? (TYP_COLORS[sv.gutachterTyp ?? 'kfz-gutachter']?.fill ?? LAYER.sv.fill)
          : '#ef4444'
        addMarker(sv.lng, sv.lat, color, 14, sv.name, () => setSelected({ kind: 'sv', item: sv }))
      }
    }

    if (showCommunities) {
      for (const c of communities) {
        if (c.lat == null || c.lng == null) continue
        addMarker(c.lng, c.lat, LAYER.community.fill, 18, c.name, () => setSelected({ kind: 'community', item: c }))
      }
    }

    if (showOrgs) {
      for (const o of organisationen) {
        if (o.lat == null || o.lng == null) continue
        addMarker(o.lng, o.lat, LAYER.org.fill, 18, o.name, () => setSelected({ kind: 'org', item: o }))
      }
    }
  }, [mapReady, showSvs, showCommunities, showOrgs, filteredSvs, communities, organisationen])

  // ─── Polygon-Overlays (AAR-130) ────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current

    polygonClickHandlersRef.current.clear()

    function buildFeatures<T extends { id: string; isochrone?: GeoPolygon }>(
      items: T[],
      visible: boolean,
      color: (item: T) => string,
      handler: (item: T) => void,
    ) {
      if (!visible) return []
      return items.flatMap((item) => {
        const coords = item.isochrone?.coordinates?.[0]
        if (!coords || coords.length < 3) return []
        polygonClickHandlersRef.current.set(item.id, () => handler(item))
        return [{
          type: 'Feature' as const,
          // isochrone ist hier garantiert non-null (coords-Check oben)
          geometry: item.isochrone!,
          properties: { color: color(item), entityId: item.id },
        }]
      })
    }

    const svFeatures = buildFeatures(
      filteredSvs,
      showOverlays && showSvs,
      (sv) => TYP_COLORS[sv.gutachterTyp ?? 'kfz-gutachter']?.fill ?? LAYER.sv.fill,
      (sv) => setSelected({ kind: 'sv', item: sv }),
    )
    const communityFeatures = buildFeatures(
      communities,
      showOverlays && showCommunities,
      () => LAYER.community.fill,
      (c) => setSelected({ kind: 'community', item: c }),
    )
    const orgFeatures = buildFeatures(
      organisationen,
      showOverlays && showOrgs,
      () => LAYER.org.fill,
      (o) => setSelected({ kind: 'org', item: o }),
    )

    ;(map.getSource('sv-overlays') as MapboxGeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: svFeatures })
    ;(map.getSource('community-overlays') as MapboxGeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: communityFeatures })
    ;(map.getSource('org-overlays') as MapboxGeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: orgFeatures })
  }, [mapReady, showOverlays, showSvs, showCommunities, showOrgs, filteredSvs, communities, organisationen])

  // ─── KFZ-158: SV Live-Positionen via Realtime (AAR-131 migriert) ──────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current
    const supabase = createClient()

    function upsertLiveMarker(svId: string, lat: number, lng: number, name: string) {
      const existing = liveMarkersRef.current.get(svId)
      if (existing) {
        existing.setLngLat([lng, lat])
        return
      }
      // Pfeil-förmiges Live-Marker-Element (blau, rotiert)
      const el = document.createElement('div')
      el.style.cssText = [
        'width:14px', 'height:14px',
        'background:#3B82F6',
        'border:2px solid #fff',
        'clip-path:polygon(50% 0%,0% 100%,100% 100%)',
        'cursor:default',
        'box-shadow:0 1px 4px rgba(0,0,0,.3)',
      ].join(';')
      el.title = `${name} (Live)`
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map) as MapboxMarker
      liveMarkersRef.current.set(svId, marker)
    }

    // Initiale Positionen: letzte pro SV, 30-Min-Cutoff
    supabase
      .from('sv_live_position')
      .select('sv_id, lat, lng, updated_at')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        const latest = new Map<string, { lat: number; lng: number; updated_at: string }>()
        for (const row of data) {
          if (!latest.has(row.sv_id)) {
            latest.set(row.sv_id, { lat: Number(row.lat), lng: Number(row.lng), updated_at: row.updated_at })
          }
        }
        const cutoff = Date.now() - 30 * 60 * 1000
        for (const [svId, pos] of latest) {
          if (new Date(pos.updated_at).getTime() < cutoff) continue
          const svName = svs.find((s) => s.id === svId)?.name ?? 'SV'
          upsertLiveMarker(svId, pos.lat, pos.lng, svName)
        }
      })

    // Realtime-Channel
    const channel = supabase
      .channel('admin-sv-live-positions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sv_live_position' },
        (payload) => {
          const row = payload.new as { sv_id: string; lat: string; lng: string }
          const svName = svs.find((s) => s.id === row.sv_id)?.name ?? 'SV'
          upsertLiveMarker(row.sv_id, Number(row.lat), Number(row.lng), svName)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      for (const m of liveMarkersRef.current.values()) m.remove()
      liveMarkersRef.current.clear()
    }
  }, [mapReady, svs])

  // AAR-131: Pan + Zoom bei Klick in Sidebar-Liste
  function panToSv(sv: SvMarker) {
    setSelected({ kind: 'sv', item: sv })
    if (mapRef.current && sv.lat != null && sv.lng != null) {
      mapRef.current.flyTo({ center: [sv.lng, sv.lat], zoom: 12, pitch: 50 })
    }
  }

  // AAR SV-Audit-Konsolidierung: Status-Counts für das Banner oben.
  // Zeigt Admin die Bucket-Verteilung + One-Click-Switch zum Onboarding-Filter
  // wenn mindestens 1 SV im Onboarding ist (häufige Ursache für „neu angelegt
  // nicht sichtbar" weil Default-Filter „Aktiv" ist).
  const statusCounts = svs.reduce(
    (acc, sv) => {
      if (sv.gesperrtSeit) acc.gesperrt++
      else if (sv.portalZugangFreigeschaltet !== true || sv.istAktiv === false) acc.onboarding++
      else acc.aktiv++
      return acc
    },
    { aktiv: 0, onboarding: 0, gesperrt: 0 },
  )
  const bannerEmpfehlungOnboarding = svFilter === 'aktive' && statusCounts.onboarding > 0

  return (
    // AAR-123: h-full aus dem Layout-Parent (flex-1 min-h-0) statt viewport-basiert
    // AAR-664: Breakout aus dem 80%-PageContainer-Inset (10% links + 10% rechts
    // sind auf der interaktiven Karte verschenkter Platz und produzieren einen
    // horizontalen Overflow). 125% von 80% = 100% Main-Breite; -12.5% shiftet
    // um 10% nach links zurück — Trick aus PageContainer.tsx dokumentiert.
    <div className="h-full flex flex-col bg-[#f8f9fb] rounded-xl overflow-hidden border border-gray-200 md:w-[125%] md:-ml-[12.5%]">
      {/* AAR SV-Audit-Konsolidierung: Status-Banner — zeigt Bucket-Counts
          und bietet One-Click-Filter-Toggle wenn Onboarding-SVs versteckt sind. */}
      {bannerEmpfehlungOnboarding && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-xs flex-shrink-0">
          <span className="text-amber-800">
            Du siehst aktuell <strong>{statusCounts.aktiv} aktive</strong> Sachverständige —
            {' '}<strong>{statusCounts.onboarding}</strong> weitere im Onboarding (warten auf Anzahlung).
          </span>
          <button
            type="button"
            onClick={() => setSvFilter('onboarding')}
            className="ml-auto px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[11px] font-medium hover:bg-amber-700"
          >
            Onboarding anzeigen →
          </button>
        </div>
      )}

      {/* Toolbar: Filter-Chips + Onboarden-Button */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
        <FilterChip
          active={showSvs}
          onClick={() => setShowSvs(!showSvs)}
          color={LAYER.sv.fill}
          label={`Sachverständige (${svs.filter((s) => s.lat != null).length}/${svs.length})`}
          Icon={LAYER.sv.icon}
        />
        <FilterChip
          active={showCommunities}
          onClick={() => setShowCommunities(!showCommunities)}
          color={LAYER.community.fill}
          label={`Communities (${communities.filter((c) => c.lat != null).length}/${communities.length})`}
          Icon={LAYER.community.icon}
        />
        <FilterChip
          active={showOrgs}
          onClick={() => setShowOrgs(!showOrgs)}
          color={LAYER.org.fill}
          label={`Organisationen (${organisationen.filter((o) => o.lat != null).length}/${organisationen.length})`}
          Icon={LAYER.org.icon}
        />
        {/* AAR-130: Toggle für Isochrone-Overlays */}
        <FilterChip
          active={showOverlays}
          onClick={() => setShowOverlays(!showOverlays)}
          color="#0D1B3E"
          label="Einsatzgebiete"
          Icon={LayersIcon}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="px-3 py-1.5 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] flex items-center gap-1.5"
        >
          <UserPlusIcon className="w-3.5 h-3.5" /> + Neuer SV
        </button>
      </div>

      {/* AAR-131: Sidebar links (SV-Liste mit Suche/Status-Filter) + Map + Side-Panel rechts */}
      <div className="flex-1 flex min-h-0">
        <SvSidebar
          svs={svs}
          filteredSvs={filteredSvs}
          search={search}
          setSearch={setSearch}
          svFilter={svFilter}
          setSvFilter={setSvFilter}
          typFilter={typFilter}
          setTypFilter={setTypFilter}
          selectedId={selected?.kind === 'sv' ? selected.item.id : null}
          onSelect={panToSv}
        />

        <div ref={mapContainerRef} className="flex-1 min-h-0" />

        {selected && (
          <aside className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
            <DetailPanel selected={selected} onClose={() => setSelected(null)} onRecalculated={() => router.refresh()} />
          </aside>
        )}
      </div>

      {/* AAR-151: NeuSvDrawer — Slide-out Onboarding-Wizard.
          Toolbar-Button oben rechts + Sidebar-Button „+ Neuer SV" triggern das Gleiche. */}
      <NeuSvDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}

// AAR-131 + AAR-151: Sidebar mit Suche + Status-Filter + Typ-Chip-Row + Liste
function SvSidebar({
  svs,
  filteredSvs,
  search,
  setSearch,
  svFilter,
  setSvFilter,
  typFilter,
  setTypFilter,
  selectedId,
  onSelect,
}: {
  svs: SvMarker[]
  filteredSvs: SvMarker[]
  search: string
  setSearch: (v: string) => void
  svFilter: SvStatusFilter
  setSvFilter: (v: SvStatusFilter) => void
  typFilter: string | null
  setTypFilter: (v: string | null) => void
  selectedId: string | null
  onSelect: (sv: SvMarker) => void
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 bg-[#f8f9fb] flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-900">Sachverständige</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">{filteredSvs.length} von {svs.length}</p>
        </div>
        {/* AAR-236: Sidebar-Neu-Button entfernt — war Duplikat zum
            Toolbar-"+ Neuer SV"-Button oben. */}
      </div>
      {/* Suche */}
      <div className="px-4 pb-2">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
          />
        </div>
      </div>
      {/* Status-Filter (AAR SV-Audit-Konsolidierung: 4 statt 5 Tabs —
          „Deaktiv." raus, weil ist_aktiv=false jetzt Onboarding-Status bedeutet). */}
      <div className="px-4 pb-2 flex gap-1">
        {([
          { k: 'aktive', label: 'Aktiv' },
          { k: 'onboarding', label: 'Onboarding' },
          { k: 'gesperrt', label: 'Gesperrt' },
          { k: 'alle', label: 'Alle' },
        ] as const).map((f) => (
          <button
            key={f.k}
            onClick={() => setSvFilter(f.k)}
            className={`flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-colors ${
              svFilter === f.k
                ? 'bg-[#1E3A5F] text-white'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {/* AAR-151: Typ-Filter Chip-Row unter den Status-Tabs.
          Single-Select: „Alle" (null) zeigt alles, sonst genau 1 Typ.
          Chip-Farbe matcht den gutachter_typ damit Legende + Marker-Farben
          zusammenpassen. */}
      <div className="px-4 pb-2 border-b border-gray-200">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setTypFilter(null)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
              typFilter === null
                ? 'bg-[#4573A2] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Alle
          </button>
          {Object.entries(TYP_COLORS).map(([key, val]) => {
            const active = typFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTypFilter(active ? null : key)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                style={active ? { backgroundColor: val.fill } : undefined}
              >
                {!active && (
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: val.fill }}
                  />
                )}
                {val.label}
              </button>
            )
          })}
        </div>
      </div>
      {/* SV-Liste */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filteredSvs.map((sv) => {
          const ti = TYP_COLORS[sv.gutachterTyp ?? 'kfz-gutachter']
          const status = getSvStatus({
            portal_zugang_freigeschaltet: sv.portalZugangFreigeschaltet ?? null,
            vertrag_unterschrieben: sv.vertragUnterschrieben ?? null,
            gesperrt_seit: sv.gesperrtSeit ?? null,
          })
          const ablehnungen = sv.ablehnungen30Tage ?? 0
          const ablehnungenCls =
            ablehnungen > 2 ? 'bg-red-50 text-red-600' : ablehnungen > 1 ? 'bg-amber-50 text-amber-600' : 'text-gray-400'
          // AAR-659: Dispatch-Blocker-Signale für die Sidebar (Urlaub + SA-Vorlage offen).
          const heute = new Date().toISOString().slice(0, 10)
          const imUrlaub = !!(sv.urlaubVon && sv.urlaubBis && heute >= sv.urlaubVon && heute <= sv.urlaubBis)
          const saOffen = !!sv.saVorlageStatus && sv.saVorlageStatus !== 'freigegeben'
          return (
            <button
              key={sv.id}
              onClick={() => onSelect(sv)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors mb-0.5 ${
                selectedId === sv.id
                  ? 'bg-[#1E3A5F]/20 border border-[#1E3A5F]/30'
                  : sv.istAktiv === false
                    ? 'bg-red-50/60 hover:bg-red-50'
                    : 'hover:bg-gray-100/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: sv.istAktiv === false ? '#f87171' : ti?.fill ?? '#4573A2' }}
                />
                <span
                  className={`text-sm truncate flex-1 ${
                    sv.istAktiv === false ? 'text-gray-400 line-through' : 'text-gray-800'
                  }`}
                >
                  {sv.name}
                </span>
                {/* AAR-659: Dispatch-Blocker-Badges + Verifiziert-Haken */}
                {imUrlaub && (
                  <span title={`Urlaub ${sv.urlaubVon} – ${sv.urlaubBis}`} className="text-[8px] bg-amber-50 text-amber-700 px-1 py-0.5 rounded font-medium shrink-0">
                    Urlaub
                  </span>
                )}
                {saOffen && (
                  <span title={`SA-Vorlage: ${sv.saVorlageStatus}`} className="text-[8px] bg-orange-50 text-orange-700 px-1 py-0.5 rounded font-medium shrink-0">
                    SA
                  </span>
                )}
                {sv.verifiziert && (
                  <span title="Verifiziert" className="text-[10px] text-emerald-600 shrink-0" aria-label="Verifiziert">✓</span>
                )}
                {sv.istAktiv === false && (
                  <span className="text-[8px] bg-red-50 text-red-500 px-1 py-0.5 rounded font-medium shrink-0">
                    Deaktiviert
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 ml-4.5">
                <span className="text-gray-400 text-[10px]">
                  {PAKET_LABEL[sv.paket ?? ''] ?? sv.paket} · {sv.offeneFaelle ?? 0}/{sv.maxFaelleMonat ?? '?'}
                </span>
                {ablehnungen > 0 && (
                  <span className={`text-[8px] px-1 py-0.5 rounded font-medium ${ablehnungenCls}`}>
                    Abl: {ablehnungen}
                  </span>
                )}
                <span
                  className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${status.bg} ${status.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>
            </button>
          )
        })}
        {filteredSvs.length === 0 && (
          <p className="px-3 py-6 text-xs text-gray-400 text-center">Keine SVs gefunden</p>
        )}
      </div>
    </aside>
  )
}

function FilterChip({
  active,
  onClick,
  color,
  label,
  Icon,
}: {
  active: boolean
  onClick: () => void
  color: string
  label: string
  Icon: typeof CarFrontIcon
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border ${
        active
          ? 'text-white border-transparent'
          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
      }`}
      style={active ? { backgroundColor: color } : {}}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function DetailPanel({
  selected,
  onClose,
  onRecalculated,
}: {
  selected: NonNullable<Selected>
  onClose: () => void
  onRecalculated: () => void
}) {
  // AAR-130: Einsatzgebiet-Block + Neu-Berechnen-Button für SVs und Orgs/Communities.
  // Communities/Orgs werden serverseitig als entityType='organisation' behandelt
  // (sind dieselbe Tabelle). isochrone/einsatzKm leben bei allen 3 Marker-Typen mit
  // gleichem Field-Namen — daher hier shared destructure.
  const isochrone = (selected.item as { isochrone?: GeoPolygon }).isochrone ?? null
  const einsatzKm = (selected.item as { einsatzKm?: number | null }).einsatzKm ?? null
  const entityType: 'sv' | 'organisation' = selected.kind === 'sv' ? 'sv' : 'organisation'

  if (selected.kind === 'sv') {
    const sv = selected.item
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase text-gray-400">Sachverständiger</p>
            <h3 className="text-sm font-semibold text-gray-900">{sv.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{sv.paket ?? '—'}</span>
          {!sv.istAktiv && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Deaktiviert</span>}
          {sv.verifiziert && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Verifiziert</span>}
          {sv.urlaubVon && sv.urlaubBis && (() => {
            const heute = new Date().toISOString().slice(0, 10)
            const aktiv = heute >= sv.urlaubVon && heute <= sv.urlaubBis
            return (
              <span className={`px-2 py-0.5 rounded-full font-medium ${aktiv ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                Urlaub: {sv.urlaubVon} – {sv.urlaubBis}
              </span>
            )
          })()}
          {sv.saVorlageStatus && sv.saVorlageStatus !== 'freigegeben' && (
            <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">
              SA-Vorlage: {sv.saVorlageStatus}
            </span>
          )}
        </div>
        {sv.lat != null && sv.lng != null && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <MapPinIcon className="w-3 h-3" /> {sv.lat.toFixed(3)}, {sv.lng.toFixed(3)}
          </p>
        )}
        {(sv.bvskNr || sv.ihkNr || sv.oebuvNr) && (
          <div className="flex flex-wrap gap-1 pt-1">
            {sv.bvskNr && <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">BVSK {sv.bvskNr}</span>}
            {sv.ihkNr && <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">IHK {sv.ihkNr}</span>}
            {sv.oebuvNr && <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-mono">öbuv {sv.oebuvNr}</span>}
          </div>
        )}
        {sv.notizen && (
          <div className="pt-1">
            <p className="text-[10px] uppercase text-gray-400 mb-0.5">Notizen</p>
            <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3">{sv.notizen}</p>
          </div>
        )}
        <EinsatzGebietBlock
          key={sv.id}
          entityType={entityType}
          entityId={sv.id}
          isochrone={isochrone}
          einsatzKm={einsatzKm}
          hasCoords={sv.lat != null && sv.lng != null}
          onRecalculated={onRecalculated}
        />
        <Link
          href={`/admin/sachverstaendige/${sv.id}`}
          className="text-xs text-[#4573A2] hover:underline flex items-center gap-1"
        >
          Details öffnen <ArrowRightIcon className="w-3 h-3" />
        </Link>
      </div>
    )
  }

  if (selected.kind === 'community') {
    const c = selected.item
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase text-gray-400">Community</p>
            <h3 className="text-sm font-semibold text-gray-900">{c.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {c.exklusiv && <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Exklusiv</span>}
          {c.maxFaelle != null && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">Max {c.maxFaelle}/Monat</span>}
        </div>
        <EinsatzGebietBlock
          key={c.id}
          entityType={entityType}
          entityId={c.id}
          isochrone={isochrone}
          einsatzKm={einsatzKm}
          hasCoords={c.lat != null && c.lng != null}
          onRecalculated={onRecalculated}
        />
        <Link
          href="/admin/partner/communities"
          className="text-xs text-[#4573A2] hover:underline flex items-center gap-1"
        >
          Zur Communities-Liste <ArrowRightIcon className="w-3 h-3" />
        </Link>
      </div>
    )
  }

  const o = selected.item
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase text-gray-400">{o.typ === 'buero' ? 'Büro' : 'Akademie'}</p>
          <h3 className="text-sm font-semibold text-gray-900">{o.name}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <EinsatzGebietBlock
        key={o.id}
        entityType={entityType}
        entityId={o.id}
        isochrone={isochrone}
        einsatzKm={einsatzKm}
        hasCoords={o.lat != null && o.lng != null}
        onRecalculated={onRecalculated}
      />
      <Link
        href="/admin/partner"
        className="text-xs text-[#4573A2] hover:underline flex items-center gap-1"
      >
        Zur Organisationen-Liste <ArrowRightIcon className="w-3 h-3" />
      </Link>
    </div>
  )
}

// AAR-130: Einsatzgebiet-Block mit Neu-Berechnen-Button (HERE API)
function EinsatzGebietBlock({
  entityType,
  entityId,
  isochrone,
  einsatzKm,
  hasCoords,
  onRecalculated,
}: {
  entityType: 'sv' | 'organisation'
  entityId: string
  isochrone: GeoPolygon
  einsatzKm: number | null
  hasCoords: boolean
  onRecalculated: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  // AAR-130 (revalidiert): pointCount lokal mirrorn — nach Recalc zeigen wir
  // den neuen Wert an obwohl router.refresh() den selected-State im Parent nicht ändert.
  const initialPointCount = isochrone?.coordinates?.[0]?.length ?? 0
  const [pointCount, setPointCount] = useState(initialPointCount)

  // Disable wenn keine Koordinaten — HERE braucht lat/lng
  const disabled = pending || !hasCoords || !einsatzKm || einsatzKm <= 0
  const disabledReason = !hasCoords
    ? 'Keine Koordinaten gesetzt'
    : !einsatzKm || einsatzKm <= 0
      ? 'Kein Radius gesetzt'
      : ''

  function handleRecalc() {
    startTransition(async () => {
      const r = await recalculateIsochrone(entityType, entityId)
      if (r.success) {
        setToast(`${r.pointCount ?? '?'} Punkte gespeichert`)
        if (r.pointCount) setPointCount(r.pointCount)
        onRecalculated()
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(null), 4000)
    })
  }

  return (
    <div className="border-t border-gray-100 pt-3 space-y-2">
      <p className="text-[10px] uppercase text-gray-400 flex items-center gap-1">
        <LayersIcon className="w-3 h-3" /> Einsatzgebiet
      </p>
      <div className="text-xs text-gray-600 space-y-0.5">
        <p>{einsatzKm != null ? `${einsatzKm} km Radius` : 'Kein Radius gesetzt'}</p>
        <p className="text-gray-400">
          {pointCount > 0 ? `Polygon mit ${pointCount} Punkten` : 'Kein Polygon vorhanden'}
        </p>
      </div>
      <button
        type="button"
        onClick={handleRecalc}
        disabled={disabled}
        title={disabled && !pending ? disabledReason : ''}
        className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-[#4573A2] text-[#4573A2] hover:bg-[#4573A2] hover:text-white transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#4573A2] flex items-center justify-center gap-1.5"
      >
        <RefreshCwIcon className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Berechne...' : 'Neu berechnen'}
      </button>
      {toast && (
        <p className={`text-[10px] ${toast.includes('Punkte') ? 'text-emerald-700' : 'text-red-700'}`}>
          {toast}
        </p>
      )}
    </div>
  )
}
