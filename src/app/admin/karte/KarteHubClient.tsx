'use client'

// AAR-122: Karte als Hub — SVs + Communities + Organisationen als Layer
// Drei Filter-Chips oberhalb der Karte, drei Marker-Farben, ein gemeinsames
// Detail-Panel rechts. Communities/Orgs leiten auf ihre vollen Listing-Pages
// weiter (Deep-Links bleiben erreichbar, Nav-Items sind konsolidiert).

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CarFrontIcon, ShieldCheckIcon, Building2Icon, UserPlusIcon,
  XIcon, MapPinIcon, ArrowRightIcon, LayersIcon, RefreshCwIcon,
} from 'lucide-react'
import { recalculateIsochrone } from './actions'

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
  const [mapReady, setMapReady] = useState(false)

  const [showSvs, setShowSvs] = useState(true)
  const [showCommunities, setShowCommunities] = useState(true)
  const [showOrgs, setShowOrgs] = useState(true)
  // AAR-130: Default off — Polygone werden auf Wunsch eingeblendet
  const [showOverlays, setShowOverlays] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)

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
      for (const sv of svs) {
        if (sv.lat == null || sv.lng == null) continue
        addMarker(
          { lat: sv.lat, lng: sv.lng },
          sv.istAktiv ? LAYER.sv.fill : '#ef4444',
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
  }, [mapReady, showSvs, showCommunities, showOrgs, svs, communities, organisationen])

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

    function addPolygon(geo: GeoPolygon, color: string, layerVisible: boolean) {
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
        clickable: false,
      })
      polygon.addListener('mouseover', () => polygon.setOptions({ fillOpacity: 0.25 }))
      polygon.addListener('mouseout', () => polygon.setOptions({ fillOpacity: 0.12 }))
      polygonsRef.current.push(polygon)
    }

    for (const sv of svs) addPolygon(sv.isochrone ?? null, LAYER.sv.fill, showSvs)
    for (const c of communities) addPolygon(c.isochrone ?? null, LAYER.community.fill, showCommunities)
    for (const o of organisationen) addPolygon(o.isochrone ?? null, LAYER.org.fill, showOrgs)
  }, [mapReady, showOverlays, showSvs, showCommunities, showOrgs, svs, communities, organisationen])

  if (!apiKey) {
    return (
      <div className="py-8 text-center text-sm text-red-600">
        NEXT_PUBLIC_GOOGLE_MAPS_KEY fehlt — Karte kann nicht geladen werden.
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col bg-[#f8f9fb] rounded-xl overflow-hidden border border-gray-200">
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
          onClick={() => router.push('/admin/sv-onboarding')}
          className="px-3 py-1.5 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#0D1B3E] flex items-center gap-1.5"
        >
          <UserPlusIcon className="w-3.5 h-3.5" /> SV onboarden
        </button>
      </div>

      {/* Map + Side-Panel */}
      <div className="flex-1 flex min-h-0">
        <div ref={mapContainerRef} className="flex-1 min-h-0" />

        {selected && (
          <aside className="w-80 border-l border-gray-200 bg-white overflow-y-auto flex-shrink-0">
            <DetailPanel selected={selected} onClose={() => setSelected(null)} onRecalculated={() => router.refresh()} />
          </aside>
        )}
      </div>
    </div>
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
  // (sind dieselbe Tabelle).
  const entityKey = selected.kind
  const item = selected.item
  const isochrone = (item as { isochrone?: GeoPolygon }).isochrone ?? null
  const einsatzKm = (item as { einsatzKm?: number | null }).einsatzKm ?? null
  const entityType: 'sv' | 'organisation' = entityKey === 'sv' ? 'sv' : 'organisation'

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
          entityType={entityType}
          entityId={sv.id}
          isochrone={isochrone}
          einsatzKm={einsatzKm}
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
          entityType={entityType}
          entityId={c.id}
          isochrone={isochrone}
          einsatzKm={einsatzKm}
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
        entityType={entityType}
        entityId={o.id}
        isochrone={isochrone}
        einsatzKm={einsatzKm}
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
  onRecalculated,
}: {
  entityType: 'sv' | 'organisation'
  entityId: string
  isochrone: GeoPolygon
  einsatzKm: number | null
  onRecalculated: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const pointCount = isochrone?.coordinates?.[0]?.length ?? 0

  function handleRecalc() {
    startTransition(async () => {
      const r = await recalculateIsochrone(entityType, entityId)
      if (r.success) {
        setToast(`${r.pointCount ?? '?'} Punkte gespeichert`)
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
        disabled={pending}
        className="w-full text-xs font-medium px-3 py-1.5 rounded-lg border border-[#4573A2] text-[#4573A2] hover:bg-[#4573A2] hover:text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
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
