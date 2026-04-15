'use client'

// AAR-122: Karte als Hub — SVs + Communities + Organisationen als Layer
// Drei Filter-Chips oberhalb der Karte, drei Marker-Farben, ein gemeinsames
// Detail-Panel rechts. Communities/Orgs leiten auf ihre vollen Listing-Pages
// weiter (Deep-Links bleiben erreichbar, Nav-Items sind konsolidiert).

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

type SvStatusFilter = 'aktive' | 'deaktivierte' | 'gesperrt' | 'alle'

const MAPS_SCRIPT_ID = 'google-maps-script'

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) { resolve(); return }
    if (document.getElementById(MAPS_SCRIPT_ID)) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.id = MAPS_SCRIPT_ID
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps load failed'))
    document.head.appendChild(s)
  })
}

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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const router = useRouter()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  // AAR-130: Polygon-Overlays separat tracken damit sie unabhängig von Markern
  // gecleant werden können (Toggle "Einsatzgebiete" + verschiedene Layer)
  const polygonsRef = useRef<google.maps.Polygon[]>([])
  // AAR-131 (KFZ-158): Live-Marker für unterwegs-SVs separat tracken
  const liveMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map())
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
  const filteredSvs = useMemo(() => {
    return svs.filter((sv) => {
      const istGesperrt = !!sv.gesperrtSeit
      const istDeaktiviert = sv.istAktiv === false
      if (svFilter === 'gesperrt' && !istGesperrt) return false
      if (svFilter === 'aktive' && (istGesperrt || istDeaktiviert)) return false
      if (svFilter === 'deaktivierte' && (istGesperrt || !istDeaktiviert)) return false
      if (typFilter && (sv.gutachterTyp ?? 'kfz-gutachter') !== typFilter) return false
      if (search && !sv.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [svs, svFilter, typFilter, search])

  // ─── Map init (runs once) ──────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return
    let cancelled = false
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapContainerRef.current || mapRef.current) return
      mapRef.current = new google.maps.Map(mapContainerRef.current, {
        center: { lat: 51.1657, lng: 10.4515 },
        zoom: 6,
        gestureHandling: 'greedy',
        disableDefaultUI: false,
        styles: [
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8ef' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0f0f0' }] },
          { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      })
      setMapReady(true)
    }).catch((err) => console.error('[KarteHub]', err))
    return () => {
      cancelled = true
    }
  }, [apiKey])

  // ─── Marker render (dep: showSvs/Communities/Orgs + data) ──────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current

    // Cleanup old markers
    markersRef.current.forEach((m) => {
      google.maps.event.clearInstanceListeners(m)
      m.setMap(null)
    })
    markersRef.current = []

    function addMarker(
      pos: { lat: number; lng: number },
      color: string,
      scale: number,
      title: string,
      onClick: () => void,
    ) {
      const marker = new google.maps.Marker({
        position: pos,
        map,
        title,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
      })
      marker.addListener('click', onClick)
      markersRef.current.push(marker)
    }

    if (showSvs) {
      // AAR-131: Marker nutzen TYP_COLORS, deaktivierte SVs bleiben rot+gedimt.
      // Filter wird angewendet — Sidebar + Karte zeigen identischen Subset.
      for (const sv of filteredSvs) {
        if (sv.lat == null || sv.lng == null) continue
        const typColor = TYP_COLORS[sv.gutachterTyp ?? 'kfz-gutachter']?.fill ?? LAYER.sv.fill
        addMarker(
          { lat: sv.lat, lng: sv.lng },
          sv.istAktiv ? typColor : '#ef4444',
          7,
          sv.name,
          () => setSelected({ kind: 'sv', item: sv }),
        )
      }
    }

    if (showCommunities) {
      for (const c of communities) {
        if (c.lat == null || c.lng == null) continue
        addMarker(
          { lat: c.lat, lng: c.lng },
          LAYER.community.fill,
          9,
          c.name,
          () => setSelected({ kind: 'community', item: c }),
        )
      }
    }

    if (showOrgs) {
      for (const o of organisationen) {
        if (o.lat == null || o.lng == null) continue
        addMarker(
          { lat: o.lat, lng: o.lng },
          LAYER.org.fill,
          9,
          o.name,
          () => setSelected({ kind: 'org', item: o }),
        )
      }
    }
  }, [mapReady, showSvs, showCommunities, showOrgs, filteredSvs, communities, organisationen])

  // ─── Polygon-Overlays render (AAR-130) ─────────────────────────
  // Hover-Verhalten + Layer-Farben + clickable=false damit Marker-Click durchgeht.
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current

    // Cleanup
    polygonsRef.current.forEach((p) => {
      google.maps.event.clearInstanceListeners(p)
      p.setMap(null)
    })
    polygonsRef.current = []

    if (!showOverlays) return

    function addPolygon(
      geo: GeoPolygon,
      color: string,
      layerVisible: boolean,
      onClick?: () => void,
    ) {
      if (!layerVisible || !geo || !geo.coordinates?.[0]) return
      // GeoJSON [lng, lat] → Google Maps {lat, lng}
      const path = geo.coordinates[0].map(([lng, lat]) => ({ lat, lng }))
      if (path.length < 3) return
      const polygon = new google.maps.Polygon({
        paths: path,
        map,
        fillColor: color,
        fillOpacity: 0.12,
        strokeColor: color,
        strokeOpacity: 0.6,
        strokeWeight: 2,
        // AAR-131: clickable damit Polygon-Click das Detail-Panel öffnet
        clickable: !!onClick,
      })
      polygon.addListener('mouseover', () => polygon.setOptions({ fillOpacity: 0.25, strokeWeight: 3 }))
      polygon.addListener('mouseout', () => polygon.setOptions({ fillOpacity: 0.12, strokeWeight: 2 }))
      if (onClick) polygon.addListener('click', onClick)
      polygonsRef.current.push(polygon)
    }

    // AAR-131: SV-Polygone respektieren den Status/Typ-Filter (nur filteredSvs)
    for (const sv of filteredSvs) {
      addPolygon(sv.isochrone ?? null, TYP_COLORS[sv.gutachterTyp ?? 'kfz-gutachter']?.fill ?? LAYER.sv.fill, showSvs, () => setSelected({ kind: 'sv', item: sv }))
    }
    for (const c of communities) {
      addPolygon(c.isochrone ?? null, LAYER.community.fill, showCommunities, () => setSelected({ kind: 'community', item: c }))
    }
    for (const o of organisationen) {
      addPolygon(o.isochrone ?? null, LAYER.org.fill, showOrgs, () => setSelected({ kind: 'org', item: o }))
    }
  }, [mapReady, showOverlays, showSvs, showCommunities, showOrgs, filteredSvs, communities, organisationen])

  // ─── KFZ-158: SV Live-Positionen via Realtime (AAR-131 migriert) ────
  // Forward-Arrow-Marker in Blau, 30-Min-Cutoff für initiale Positionen.
  // Realtime-INSERTs auf sv_live_position aktualisieren oder fügen Marker ein.
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current
    const supabase = createClient()

    function upsertLiveMarker(svId: string, lat: number, lng: number, name: string) {
      const existing = liveMarkersRef.current.get(svId)
      if (existing) {
        existing.setPosition({ lat, lng })
        return
      }
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          rotation: 0,
        },
        title: `${name} (Live)`,
        zIndex: 30,
      })
      liveMarkersRef.current.set(svId, marker)
    }

    // Initial: letzte Position pro SV laden, 30-Min-Cutoff
    supabase
      .from('sv_live_position')
      .select('gutachter_id, lat, lng, updated_at')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        const latest = new Map<string, { lat: number; lng: number; updated_at: string }>()
        for (const row of data) {
          if (!latest.has(row.gutachter_id)) {
            latest.set(row.gutachter_id, {
              lat: Number(row.lat),
              lng: Number(row.lng),
              updated_at: row.updated_at,
            })
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
          const row = payload.new as { gutachter_id: string; lat: string; lng: string }
          const svName = svs.find((s) => s.id === row.gutachter_id)?.name ?? 'SV'
          upsertLiveMarker(row.gutachter_id, Number(row.lat), Number(row.lng), svName)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      for (const m of liveMarkersRef.current.values()) m.setMap(null)
      liveMarkersRef.current.clear()
    }
  }, [mapReady, svs])

  // AAR-131: Pan + Zoom bei Klick in Sidebar-Liste
  function panToSv(sv: SvMarker) {
    setSelected({ kind: 'sv', item: sv })
    if (mapRef.current && sv.lat != null && sv.lng != null) {
      mapRef.current.panTo({ lat: sv.lat, lng: sv.lng })
      mapRef.current.setZoom(12)
    }
  }

  if (!apiKey) {
    return (
      <div className="py-8 text-center text-sm text-red-600">
        NEXT_PUBLIC_GOOGLE_MAPS_KEY fehlt — Karte kann nicht geladen werden.
      </div>
    )
  }

  return (
    // AAR-123: war ursprünglich h-[calc(100vh-120px)] für die alte /admin/karte-
    // Route. Mit dem Tab-Bar im neuen Sachverständige-Hub kommen ~50px dazu —
    // h-full nimmt die Höhe direkt aus dem Layout-Parent (`flex-1 min-h-0`)
    // statt sie viewport-basiert zu schätzen.
    <div className="h-full flex flex-col bg-[#f8f9fb] rounded-xl overflow-hidden border border-gray-200">
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
          onOpenDrawer={() => setDrawerOpen(true)}
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
  onOpenDrawer,
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
  onOpenDrawer: () => void
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-gray-200 bg-[#f8f9fb] flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-900">Sachverständige</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">{filteredSvs.length} von {svs.length}</p>
        </div>
        {/* AAR-151: „+ Neuer SV"-Button prominent in der Sidebar oben rechts */}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="px-2 py-1 rounded-md bg-[#4573A2] text-white text-[11px] font-medium hover:bg-[#0D1B3E] flex items-center gap-1 shrink-0"
          title="Neuen SV onboarden"
        >
          <UserPlusIcon className="w-3 h-3" /> Neu
        </button>
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
      {/* 4-Stufen-Status-Filter */}
      <div className="px-4 pb-2 flex gap-1">
        {([
          { k: 'aktive', label: 'Aktiv' },
          { k: 'deaktivierte', label: 'Deaktiv.' },
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
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{sv.paket ?? '—'}</span>
          {!sv.istAktiv && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">Deaktiviert</span>}
        </div>
        {sv.lat != null && sv.lng != null && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <MapPinIcon className="w-3 h-3" /> {sv.lat.toFixed(3)}, {sv.lng.toFixed(3)}
          </p>
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
          href="/admin/communities"
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
        href="/admin/organisationen"
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
