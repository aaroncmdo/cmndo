'use client'

import { useEffect, useState, useRef } from 'react'
import { SearchIcon, XIcon, UserPlusIcon, PhoneIcon, MailIcon, MapPinIcon, PencilIcon, CheckIcon, PowerOffIcon, Trash2Icon, RefreshCwIcon, AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'
import GutachterSlideOver from './GutachterSlideOver'
import GutachterProfilPanel from './GutachterProfilPanel'
import { updateGutachterProfil, reactivateGutachter, deactivateGutachter, softDeleteGutachter, reassignCases, getOpenCasesCount } from './actions'

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface SV {
  id: string
  name: string
  email: string
  telefon?: string
  gebietPlz: string[]
  radiusKm: number
  paket: string
  offeneFaelle: number
  maxFaelleMonat: number
  standortLat: number | null
  standortLng: number | null
  organisationId: string | null
  gutachterTyp: string
  standortAdresse?: string | null
  guthaben?: number
  qualifikationen?: string[]
  anzahlungStatus?: string
  istAktiv?: boolean
  deaktiviertGrund?: string | null
  deaktiviertAm?: string | null
  geloeschtAm?: string | null
}

interface Fall {
  id: string
  fallNummer: string
  status: string
  schadensUrsache: string | null
  adresse: string
  schadensPLZ: string | null
  schadensOrt: string | null
  svId: string | null
  kunde: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants (module-level, stable references, never re-created)
// ═══════════════════════════════════════════════════════════════════════════

const TYP_COLORS: Record<string, { fill: string; marker: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', marker: 'bg-[#4573A2]', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', marker: 'bg-orange-500', label: 'DAT' },
  akademie: { fill: '#22c55e', marker: 'bg-green-500', label: 'Akademie' },
  gutachterbuero: { fill: '#a855f7', marker: 'bg-purple-500', label: 'Buero' },
}

const PAKET_LABEL: Record<string, string> = {
  'starter-10': 'Standard', standard: 'Standard',
  'standard-25': 'Pro', pro: 'Pro',
  'premium-50': 'Premium', premium: 'Premium',
}

// Paket → Radius in meters (with 0.7 correction factor: Luftlinie → Fahrstrecke)
const PAKET_RADIUS_M: Record<string, number> = {
  'starter-10': 10500, standard: 10500,
  'standard-25': 28000, pro: 28000,
  'premium-50': 49000, premium: 49000,
}
// Note: legacy keys (starter-10 etc.) kept for backward compatibility with existing DB entries

const ALL_QUALIFIKATIONEN = [
  'Haftpflichtschaden', 'Kaskoschaden', 'Leasingrueckgabe', 'Flottenmanagement',
  'Oldtimer', 'LKW/Nutzfahrzeuge', 'Motorrad', 'Wohnmobil',
  'Totalschaden-Bewertung', 'Wiederbeschaffungswert', 'Beweissicherung', 'Gerichtsgutachten',
]

const MAPS_SCRIPT_ID = 'google-maps-script'

// Isochrone cache (module-level, persists across renders)
const isoCache: Record<string, { lat: number; lng: number }[]> = {}

async function fetchIsochrone(lat: number, lng: number, radiusKm: number): Promise<{ lat: number; lng: number }[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`
  if (isoCache[key]) return isoCache[key]
  try {
    const r = await fetch(`/api/isochrone?lat=${lat}&lng=${lng}&radius_km=${Math.round(radiusKm * 0.7)}`)
    if (!r.ok) return []
    const d = await r.json()
    if (d.polygon) { isoCache[key] = d.polygon; return d.polygon }
  } catch { /* */ }
  return []
}

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
    s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps load failed'))
    document.head.appendChild(s)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// Native Google Maps API. ALL map objects in useRef.
// useEffect deps: [sachverstaendige, mapReady] only. NOT selectedSV.
// ═══════════════════════════════════════════════════════════════════════════

export default function KarteClient({ sachverstaendige, faelle }: { sachverstaendige: SV[]; faelle: Fall[] }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

  // Refs for Google Maps objects (NOT state)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const polygonsRef = useRef<google.maps.Polygon[]>([])

  // State ONLY for UI overlays
  const [selectedSV, setSelectedSV] = useState<SV | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [search, setSearch] = useState('')
  const [svFilter, setSvFilter] = useState<'aktive' | 'deaktivierte' | 'alle'>('aktive')

  // ─── Map init (runs ONCE) ──────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return
    let cancelled = false
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapContainerRef.current || mapRef.current) return
      mapRef.current = new google.maps.Map(mapContainerRef.current, {
        center: { lat: 51.1657, lng: 10.4515 }, zoom: 6,
        gestureHandling: 'greedy', disableDefaultUI: false,
        styles: [
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d8ef' }] },
          { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f0f0f0' }] },
          { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
          { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d6d6d6' }] },
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      })
      setMapReady(true)
    }).catch(err => console.error('[KarteClient]', err))
    return () => { cancelled = true }
  }, [apiKey])

  // ─── Filtered SVs (gelöschte sind bereits durch DB-Query ausgeschlossen) ──
  const filteredByStatus = sachverstaendige.filter(sv => {
    if (svFilter === 'aktive') return sv.istAktiv !== false
    if (svFilter === 'deaktivierte') return sv.istAktiv === false
    return true // 'alle'
  })

  // ─── SV Markers (dep: [sachverstaendige, mapReady, svFilter] ) ──
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    // Cleanup old
    markersRef.current.forEach(m => { google.maps.event.clearInstanceListeners(m); m.setMap(null) })
    markersRef.current = []

    filteredByStatus.forEach(sv => {
      if (sv.standortLat == null || sv.standortLng == null) return
      const pos = { lat: sv.standortLat, lng: sv.standortLng }
      const isDeactivated = sv.istAktiv === false
      const color = isDeactivated ? '#9ca3af' : (TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6')
      const marker = new google.maps.Marker({
        position: pos, map: mapRef.current!, title: sv.name,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: isDeactivated ? 6 : 8, fillColor: color, fillOpacity: isDeactivated ? 0.5 : 1, strokeColor: '#fff', strokeWeight: 2 },
      })
      marker.addListener('click', () => setSelectedSV(sv))
      markersRef.current.push(marker)
    })
  }, [sachverstaendige, mapReady, svFilter])

  // ─── Coverage areas: Isochronen-Polygone (OSRM) ──────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    // Cleanup old polygons
    polygonsRef.current.forEach(p => { google.maps.event.clearInstanceListeners(p); p.setMap(null) })
    polygonsRef.current = []

    filteredByStatus.forEach(sv => {
      if (sv.standortLat == null || sv.standortLng == null) return
      const isDeactivated = sv.istAktiv === false
      const color = isDeactivated ? '#9ca3af' : (TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6')

      fetchIsochrone(sv.standortLat, sv.standortLng, sv.radiusKm).then(points => {
        if (!mapRef.current || !points.length) return
        const polygon = new google.maps.Polygon({
          paths: points, map: mapRef.current,
          fillColor: color, fillOpacity: isDeactivated ? 0.05 : 0.12,
          strokeColor: color, strokeOpacity: isDeactivated ? 0.2 : 0.5, strokeWeight: isDeactivated ? 1 : 2,
          clickable: true, geodesic: true,
        })
        polygon.addListener('click', () => setSelectedSV(sv))
        polygon.addListener('mouseover', () => { polygon.setOptions({ fillOpacity: 0.25, strokeWeight: 3 }) })
        polygon.addListener('mouseout', () => { polygon.setOptions({ fillOpacity: 0.12, strokeWeight: 2 }) })
        polygonsRef.current.push(polygon)
      })
    })
  }, [sachverstaendige, mapReady, svFilter])

  // ─── Sidebar filter (no useEffect, just derived) ──────────────
  const filteredSVs = filteredByStatus.filter(sv =>
    !search || sv.name.toLowerCase().includes(search.toLowerCase())
  )

  // ─── Render ────────────────────────────────────────────────────
  if (!apiKey) return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center max-w-md">
        <p className="text-gray-900 font-medium mb-2">Google Maps API Key fehlt</p>
        <p className="text-gray-500 text-sm">NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local setzen</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen">
      {/* ─── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-[#f8f9fb] flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Karte</h1>
              <p className="text-gray-500 text-xs mt-0.5">{filteredSVs.length} von {sachverstaendige.length} SV</p>
            </div>
            <button onClick={() => setShowOnboarding(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white bg-[#4573A2] hover:bg-[#4573A2] transition-colors">
              <UserPlusIcon className="w-3.5 h-3.5" /> Neu
            </button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-300" />
          </div>
          <div className="flex gap-1 mt-2">
            {(['aktive', 'deaktivierte', 'alle'] as const).map(f => (
              <button key={f} onClick={() => setSvFilter(f)}
                className={`flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-colors ${svFilter === f ? 'bg-[#1E3A5F] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}>
                {f === 'aktive' ? 'Aktive' : f === 'deaktivierte' ? 'Deaktiv.' : 'Alle'}
              </button>
            ))}
          </div>
        </div>

        {/* Isochronen werden automatisch als Polygone angezeigt */}

        {/* SV Liste */}
        <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-gray-200">
          {filteredSVs.map(sv => {
            const ti = TYP_COLORS[sv.gutachterTyp]
            return (
              <button key={sv.id}
                onClick={() => {
                  setSelectedSV(sv)
                  if (mapRef.current && sv.standortLat && sv.standortLng) {
                    mapRef.current.panTo({ lat: sv.standortLat, lng: sv.standortLng })
                    mapRef.current.setZoom(12)
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedSV?.id === sv.id ? 'bg-[#1E3A5F]/20 border border-[#1E3A5F]/30' : 'hover:bg-gray-100/60'
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${sv.istAktiv === false ? 'bg-gray-400' : (ti?.marker ?? 'bg-[#4573A2]')}`} />
                  <span className={`text-sm truncate ${sv.istAktiv === false ? 'text-gray-400' : 'text-gray-800'}`}>{sv.name}</span>
                  {sv.istAktiv === false && <span className="text-[8px] bg-red-50 text-red-500 px-1 py-0.5 rounded font-medium shrink-0">Deaktiviert</span>}
                </div>
                <span className="text-gray-400 text-[10px] ml-4.5">{PAKET_LABEL[sv.paket] ?? sv.paket} · {sv.offeneFaelle}/{sv.maxFaelleMonat}</span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ─── Map Container ────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f8f9fb]/80 z-10">
            <div className="w-8 h-8 border-2 border-[#4573A2] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ─── Legende ──────────────────────────────────────────────── */}
        {mapReady && (
          <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm border border-gray-300/50 rounded-xl p-3 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Legende</p>
            {Object.entries(TYP_COLORS).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: val.fill, opacity: 0.7 }} />
                <span className="text-[11px] text-gray-700">{val.label}</span>
              </div>
            ))}
            <div className="border-t border-gray-300/50 pt-1.5 mt-1.5 space-y-0.5">
              <p className="text-[10px] text-gray-500">Standard: 15km</p>
              <p className="text-[10px] text-gray-500">Pro: 40km</p>
              <p className="text-[10px] text-gray-500">Premium: 70km</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Onboarding (fixed overlay, does NOT affect map) ──────── */}
      <GutachterSlideOver open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* ─── Profil-Panel (fixed overlay, does NOT affect map) ────── */}
      {selectedSV && (
        <GutachterProfilPanel sv={selectedSV} onClose={() => setSelectedSV(null)} />
      )}
    </div>
  )
}
