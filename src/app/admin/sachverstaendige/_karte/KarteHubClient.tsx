'use client'

// AAR-690: Karten-Rückbau. Google Maps statt Mapbox-3D. Ein Pin pro SV am
// Büro-Standort, Isochrone-Polygon in derselben Typ-Farbe, Klick →
// Detail-Drawer rechts mit allen Aktionen.
// AAR-690 v2: Liste rechts immer sichtbar, Hover-Highlight zwischen
// Listen-Item / Pin / Polygon, fokus-aware Rendering.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { SearchIcon } from 'lucide-react'

// ─── Types (Shape bleibt kompatibel zur page.tsx-Query) ─────────────────────

export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] } | null

export type SvMarker = {
  id: string
  name: string
  vorname?: string | null
  nachname?: string | null
  avatarUrl?: string | null
  paket: string | null
  lat: number | null
  lng: number | null
  istAktiv: boolean
  isochrone?: GeoPolygon
  einsatzKm?: number | null
  gutachterTyp?: string | null
  offeneFaelle?: number
  maxFaelleMonat?: number
  ablehnungen30Tage?: number
  portalZugangFreigeschaltet?: boolean | null
  vertragUnterschrieben?: boolean | null
  gesperrtSeit?: string | null
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

// ─── Typ-Farben (Pin + Isochrone in derselben Farbe pro Gutachter-Typ) ──────

const TYP_COLORS: Record<string, { fill: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', label: 'DAT' },
  akademie: { fill: '#22c55e', label: 'Akademie' },
  gutachterbuero: { fill: '#a855f7', label: 'Büro' },
}

function typColor(typ: string | null | undefined): { fill: string; label: string } {
  return TYP_COLORS[typ ?? 'kfz-gutachter'] ?? TYP_COLORS['kfz-gutachter']
}

// ─── Google-Maps-Loader ─────────────────────────────────────────────────────

function loadMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) { resolve(); return }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existing) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly`
    s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Maps load failed'))
    document.head.appendChild(s)
  })
}

const GERMANY_CENTER = { lat: 51.1657, lng: 10.4515 }

// Marker + Polygon Styles pro Zustand
function markerIcon(color: string, hovered: boolean) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: hovered ? 13 : 10,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: hovered ? '#0D1B3E' : '#fff',
    strokeWeight: hovered ? 3.5 : 3,
  }
}

function polygonOptions(color: string, hovered: boolean): google.maps.PolygonOptions {
  return {
    strokeColor: color,
    strokeOpacity: hovered ? 1 : 0.8,
    strokeWeight: hovered ? 2.5 : 1.5,
    fillColor: color,
    fillOpacity: hovered ? 0.28 : 0.12,
    zIndex: hovered ? 99 : 1,
  }
}

type Props = {
  svs: SvMarker[]
  communities?: CommunityMarker[]
  organisationen?: OrgMarker[]
}

export default function KarteHubClient({ svs }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<globalThis.Map<string, google.maps.Marker>>(new globalThis.Map())
  const polygonsRef = useRef<globalThis.Map<string, google.maps.Polygon>>(new globalThis.Map())
  const [mapReady, setMapReady] = useState(false)
  const [hoveredSvId, setHoveredSvId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // AAR-691: Klick auf Pin oder Listen-Item navigiert zur SV-Detail-URL.
  // Die Intercepting-Route (@drawer/(.)[id]) fängt die Navigation ab und
  // öffnet einen Drawer über der Karte. Direkter URL-Aufruf führt zur
  // Full-Page (Deep-Link-Fallback).
  const openSv = (id: string) => router.push(`/admin/sachverstaendige/${id}`)

  // Nur freigeschaltete + nicht gesperrte SVs mit Koordinaten
  const visibleSvs = svs.filter(
    (s) =>
      s.portalZugangFreigeschaltet === true &&
      !s.gesperrtSeit &&
      s.lat != null &&
      s.lng != null,
  )

  const filteredList = search.trim()
    ? visibleSvs.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.paket ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.gutachterTyp ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : visibleSvs

  // ─── Map initialisieren ─────────────────────────────────────────────────

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    let cancelled = false
    loadMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: GERMANY_CENTER,
        zoom: 6,
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      })
      setMapReady(true)
    }).catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [apiKey])

  // ─── Pins + Polygone aufbauen ───────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const map = mapRef.current

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current.clear()
    polygonsRef.current.forEach((p) => p.setMap(null))
    polygonsRef.current.clear()

    if (visibleSvs.length === 0) return

    const bounds = new google.maps.LatLngBounds()

    for (const sv of visibleSvs) {
      if (sv.lat == null || sv.lng == null) continue
      const color = typColor(sv.gutachterTyp).fill

      const marker = new google.maps.Marker({
        position: { lat: sv.lat, lng: sv.lng },
        map,
        icon: markerIcon(color, false),
        title: sv.name,
      })
      marker.addListener('click', () => openSv(sv.id))
      marker.addListener('mouseover', () => setHoveredSvId(sv.id))
      marker.addListener('mouseout', () => setHoveredSvId(null))
      markersRef.current.set(sv.id, marker)

      if (sv.isochrone && sv.isochrone.type === 'Polygon' && sv.isochrone.coordinates?.[0]) {
        const ring = sv.isochrone.coordinates[0].map(([lng, lat]) => ({ lat, lng }))
        const polygon = new google.maps.Polygon({
          ...polygonOptions(color, false),
          paths: ring,
          map,
          clickable: true,
        })
        polygon.addListener('click', () => openSv(sv.id))
        polygon.addListener('mouseover', () => setHoveredSvId(sv.id))
        polygon.addListener('mouseout', () => setHoveredSvId(null))
        polygonsRef.current.set(sv.id, polygon)
        for (const p of ring) bounds.extend(p)
      } else {
        bounds.extend({ lat: sv.lat, lng: sv.lng })
      }
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 40)
    }
  }, [visibleSvs, mapReady])

  // ─── Hover-State auf Pins + Polygone projizieren ───────────────────────

  useEffect(() => {
    if (!mapReady) return
    for (const sv of visibleSvs) {
      const color = typColor(sv.gutachterTyp).fill
      const hovered = hoveredSvId === sv.id
      markersRef.current.get(sv.id)?.setIcon(markerIcon(color, hovered))
      polygonsRef.current.get(sv.id)?.setOptions(polygonOptions(color, hovered))
    }
  }, [hoveredSvId, visibleSvs, mapReady])

  // ─── Early-Returns ───────────────────────────────────────────────────────

  if (!apiKey) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl m-4 text-sm text-amber-800">
        <strong>Karte nicht verfügbar:</strong> <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> fehlt in den Env-Variablen.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col lg:flex-row bg-white rounded-xl overflow-hidden border border-claimondo-border relative">
      {/* Linker Bereich: Header + Karte */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-claimondo-border bg-[#f8f9fb]/60 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-claimondo-navy">Sachverständige</h2>
            <span className="text-xs text-claimondo-ondo">
              {visibleSvs.length} aktiv
            </span>
            <div className="hidden md:flex items-center gap-3 text-[11px] text-claimondo-ondo ml-2">
              {Object.entries(TYP_COLORS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.fill }} />
                  {v.label}
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/admin/sachverstaendige/anlegen"
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#4573A2] text-white hover:bg-[#0D1B3E]"
          >
            + Neuer SV
          </Link>
        </div>
        <div ref={containerRef} className="flex-1 min-h-[400px]" />
      </div>

      {/* Rechte Spalte: Liste */}
      <aside className="lg:w-[320px] shrink-0 border-t lg:border-t-0 lg:border-l border-claimondo-border bg-[#f8f9fb] flex flex-col">
        <div className="p-3 border-b border-claimondo-border bg-white shrink-0">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SV suchen (Name, Paket, Typ)"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#f8f9fb] border border-claimondo-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
            />
          </div>
          <p className="text-[10px] text-claimondo-ondo/70 mt-1.5">
            {filteredList.length} von {visibleSvs.length}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredList.length === 0 && (
            <p className="px-4 py-6 text-xs text-claimondo-ondo/70 text-center">
              Keine SVs gefunden
            </p>
          )}
          {filteredList.map((sv) => {
            const color = typColor(sv.gutachterTyp)
            const isHovered = hoveredSvId === sv.id
            return (
              <button
                key={sv.id}
                type="button"
                onMouseEnter={() => setHoveredSvId(sv.id)}
                onMouseLeave={() => setHoveredSvId(null)}
                onClick={() => openSv(sv.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-claimondo-border transition-colors ${
                  isHovered ? 'bg-white' : 'hover:bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {sv.avatarUrl ? (
                    <img
                      src={sv.avatarUrl}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover shrink-0 ring-2"
                      style={{ borderColor: color.fill }}
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                      style={{ backgroundColor: color.fill }}
                    >
                      {(sv.vorname?.[0] ?? '') + (sv.nachname?.[0] ?? '') || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-claimondo-navy truncate">{sv.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${color.fill}15`, color: color.fill }}
                      >
                        {color.label}
                      </span>
                      {sv.paket && (
                        <span className="text-[9px] text-claimondo-ondo/70">· {sv.paket}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-[9px]">
                    {sv.verifiziert && (
                      <span className="text-emerald-600">✓ verif.</span>
                    )}
                    {(sv.offeneFaelle ?? 0) > 0 && (
                      <span className="text-claimondo-ondo tabular-nums">
                        {sv.offeneFaelle}/{sv.maxFaelleMonat ?? '?'}
                      </span>
                    )}
                    {sv.urlaubVon && (
                      <span className="text-amber-600">Urlaub</span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </aside>
    </div>
  )
}

