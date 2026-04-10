'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { SearchIcon, XIcon, UserPlusIcon, PhoneIcon, MailIcon, MapPinIcon, PencilIcon, CheckIcon, PowerOffIcon, Trash2Icon, RefreshCwIcon, AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'
import GutachterProfilPanel from './GutachterProfilPanel'
import { updateGutachterProfil, reactivateGutachter, deactivateGutachter, softDeleteGutachter, reassignCases, getOpenCasesCount } from './actions'
import { getSvStatus } from '@/lib/sv-status'
import NeuSvDrawer from '../sachverstaendige/NeuSvDrawer'
import { createClient } from '@/lib/supabase/client'

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
  // KFZ-154
  spezifikationen?: string[]
  schadenarten?: string[]
  anzahlungStatus?: string
  istAktiv?: boolean
  deaktiviertGrund?: string | null
  deaktiviertAm?: string | null
  geloeschtAm?: string | null
  // ARCH-1 POLISH Befund 1
  portalZugangFreigeschaltet?: boolean | null
  vertragUnterschrieben?: boolean | null
  gesperrtSeit?: string | null
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
  'Haftpflichtschaden', 'Leasingrueckgabe', 'Flottenmanagement',
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
  const liveMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const supabase = useMemo(() => createClient(), [])

  // State ONLY for UI overlays
  const [selectedSV, setSelectedSV] = useState<SV | null>(null)
  const [showNeuDrawer, setShowNeuDrawer] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [search, setSearch] = useState('')
  // BUG-92 Korrektur: Tab-Switcher als binaerer Onboarding-Filter, Quelle ist
  // jetzt portal_zugang_freigeschaltet (nicht das alte ist_aktiv-Feld). Damit
  // landet ein noch nicht bezahlter SV im 'Deaktiviert'-Fach unabhaengig vom
  // Sub-Status (Wartet auf Vertrag/Anzahlung). Sub-Status bleibt als kleine
  // Info-Badge pro Zeile sichtbar (siehe getSvStatus-Aufruf in der Liste).
  const [svFilter, setSvFilter] = useState<'aktive' | 'deaktivierte' | 'gesperrt' | 'alle'>('aktive')

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
  // BUG-92 Korrektur: Onboarding-Status binaer aus portal_zugang_freigeschaltet
  // ableiten. Gesperrt hat Vorrang. Sub-Status (Wartet auf Vertrag/Anzahlung)
  // bleibt nur als kleine Info-Badge pro Zeile, NICHT als Filter-Kategorie.
  const filteredByStatus = sachverstaendige.filter(sv => {
    const istGesperrt = !!sv.gesperrtSeit
    const istFreigeschaltet = sv.portalZugangFreigeschaltet === true
    if (svFilter === 'gesperrt') return istGesperrt
    if (svFilter === 'aktive') return !istGesperrt && istFreigeschaltet
    if (svFilter === 'deaktivierte') return !istGesperrt && !istFreigeschaltet
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
      const color = isDeactivated ? '#ef4444' : (TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6')
      const marker = new google.maps.Marker({
        position: pos, map: mapRef.current!, title: sv.name,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: isDeactivated ? 5 : 8, fillColor: color, fillOpacity: isDeactivated ? 0.4 : 1, strokeColor: '#fff', strokeWeight: 2 },
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
      const color = isDeactivated ? '#ef4444' : (TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6')

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

  // ─── KFZ-158: SV Live-Positionen via Realtime ──────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    // Initial: letzte Position pro SV laden
    supabase
      .from('sv_live_position')
      .select('gutachter_id, lat, lng, updated_at')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (!data || !mapRef.current) return
        // Nur neueste pro gutachter_id
        const latest = new Map<string, { lat: number; lng: number; updated_at: string }>()
        for (const row of data) {
          if (!latest.has(row.gutachter_id)) {
            latest.set(row.gutachter_id, { lat: Number(row.lat), lng: Number(row.lng), updated_at: row.updated_at })
          }
        }
        // Nur Positionen die < 30 min alt sind
        const cutoff = Date.now() - 30 * 60 * 1000
        for (const [svId, pos] of latest) {
          if (new Date(pos.updated_at).getTime() < cutoff) continue
          const svName = sachverstaendige.find(s => s.id === svId)?.name ?? 'SV'
          upsertLiveMarker(svId, pos.lat, pos.lng, svName)
        }
      })

    // Realtime: neue Positionen live
    const channel = supabase
      .channel('admin-sv-live-positions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sv_live_position' },
        (payload) => {
          const row = payload.new as { gutachter_id: string; lat: string; lng: string }
          const svName = sachverstaendige.find(s => s.id === row.gutachter_id)?.name ?? 'SV'
          upsertLiveMarker(row.gutachter_id, Number(row.lat), Number(row.lng), svName)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      for (const m of liveMarkersRef.current.values()) m.setMap(null)
      liveMarkersRef.current.clear()
    }
  }, [mapReady, supabase, sachverstaendige])

  function upsertLiveMarker(svId: string, lat: number, lng: number, name: string) {
    if (!mapRef.current) return
    const existing = liveMarkersRef.current.get(svId)
    if (existing) {
      existing.setPosition({ lat, lng })
      return
    }
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: mapRef.current,
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
    // BUG-98 Cleanup: -mx-* negiert das horizontale Padding des PageContainer
    // damit die Karte+Sidebar fullbleed laufen koennen. h-full statt h-screen
    // weil wir innerhalb von PageContainer (h-full innerhalb von main) leben.
    <div className="flex h-full -mx-4 sm:-mx-6 md:-mx-8 lg:-mx-16 xl:-mx-24">
      {/* ─── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-[#f8f9fb] flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Sachverstaendige</h1>
              <p className="text-gray-500 text-xs mt-0.5">{filteredSVs.length} von {sachverstaendige.length} SV</p>
            </div>
            {/* ARCH-1 POLISH Befund 4: '+ Neu' oeffnet Slide-out-Drawer
                mit AnlegenTabs (statt dem alten Self-Service-Onboarding). */}
            <button onClick={() => setShowNeuDrawer(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white bg-[#4573A2] hover:bg-[#1E3A5F] transition-colors">
              <UserPlusIcon className="w-3.5 h-3.5" /> Neu
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 space-y-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-300" />
          </div>
          {/* BUG-92 Korrektur: 4 Top-Level Tabs als binaerer Onboarding-Filter
              (Aktiv/Deaktiviert/Gesperrt/Alle). Sub-Status (Wartet auf Vertrag/
              Anzahlung) erscheint nur noch als kleine Info-Badge in der Liste. */}
          <div className="flex gap-1">
            {([
              { k: 'aktive', label: 'Aktiv' },
              { k: 'deaktivierte', label: 'Deaktiv.' },
              { k: 'gesperrt', label: 'Gesperrt' },
              { k: 'alle', label: 'Alle' },
            ] as const).map(f => (
              <button key={f.k} onClick={() => setSvFilter(f.k)}
                className={`flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-colors ${svFilter === f.k ? 'bg-[#1E3A5F] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Isochronen werden automatisch als Polygone angezeigt */}

        {/* SV Liste */}
        <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-gray-200">
          {filteredSVs.map(sv => {
            const ti = TYP_COLORS[sv.gutachterTyp]
            // ARCH-1 POLISH Befund 1: Status-Badge pro Zeile
            const status = getSvStatus({
              portal_zugang_freigeschaltet: sv.portalZugangFreigeschaltet,
              vertrag_unterschrieben: sv.vertragUnterschrieben,
              gesperrt_seit: sv.gesperrtSeit,
            })
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
                  selectedSV?.id === sv.id ? 'bg-[#1E3A5F]/20 border border-[#1E3A5F]/30' :
                  sv.istAktiv === false ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-gray-100/60'
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${sv.istAktiv === false ? 'bg-red-400' : (ti?.marker ?? 'bg-[#4573A2]')}`} />
                  <span className={`text-sm truncate flex-1 ${sv.istAktiv === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{sv.name}</span>
                  {sv.istAktiv === false && <span className="text-[8px] bg-red-50 text-red-500 px-1 py-0.5 rounded font-medium shrink-0">Deaktiviert</span>}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 ml-4.5">
                  <span className="text-gray-400 text-[10px]">{PAKET_LABEL[sv.paket] ?? sv.paket} · {sv.offeneFaelle}/{sv.maxFaelleMonat}</span>
                  <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${status.bg} ${status.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </div>
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

      {/* ─── ARCH-1 POLISH Befund 4: Slide-out Drawer fuer + Neu ──── */}
      <NeuSvDrawer open={showNeuDrawer} onOpenChange={setShowNeuDrawer} />

      {/* ─── Profil-Panel (fixed overlay, does NOT affect map) ────── */}
      {selectedSV && (
        <GutachterProfilPanel sv={selectedSV} onClose={() => setSelectedSV(null)} />
      )}
    </div>
  )
}
