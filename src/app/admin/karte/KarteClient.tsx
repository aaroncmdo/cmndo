'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { SearchIcon, XIcon, UserPlusIcon, PhoneIcon, MailIcon } from 'lucide-react'
import Link from 'next/link'
import GutachterSlideOver from './GutachterSlideOver'

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
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const TYP_COLORS: Record<string, { fill: string; marker: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', marker: 'bg-blue-500', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', marker: 'bg-orange-500', label: 'DAT' },
  akademie: { fill: '#22c55e', marker: 'bg-green-500', label: 'Akademie' },
  gutachterbuero: { fill: '#a855f7', marker: 'bg-purple-500', label: 'Buero' },
}

const PAKET_LABEL: Record<string, string> = {
  'starter-10': 'Starter', starter: 'Starter',
  'standard-25': 'Standard', pro: 'Standard',
  'premium-50': 'Premium', premium: 'Premium',
}

const MAPS_SCRIPT_ID = 'google-maps-script'

// ═══════════════════════════════════════════════════════════════════════════
// Load Google Maps script (once, globally)
// ═══════════════════════════════════════════════════════════════════════════

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) { resolve(); return }
    if (document.getElementById(MAPS_SCRIPT_ID)) {
      // Script tag exists, wait for it
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps) { clearInterval(check); resolve() }
      }, 100)
      return
    }
    const script = document.createElement('script')
    script.id = MAPS_SCRIPT_ID
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(script)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// Kein @vis.gl/react-google-maps - Native API mit useRef.
// Marker + Circles werden EINMAL im useEffect erstellt (dep: [gutachter]).
// State-Änderungen (selectedSV, showOnboarding) triggern KEIN Re-create.
// ═══════════════════════════════════════════════════════════════════════════

export default function KarteClient({ sachverstaendige, faelle }: { sachverstaendige: SV[]; faelle: Fall[] }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

  // Refs für Google Maps Objekte (NICHT state - kein Re-render)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const circlesRef = useRef<google.maps.Circle[]>([])
  const fallMarkersRef = useRef<google.maps.Marker[]>([])

  // State NUR für UI-Overlays (Panel, Onboarding)
  const [selectedSV, setSelectedSV] = useState<SV | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [search, setSearch] = useState('')

  // ─── SCHRITT 1: Map einmalig erstellen ──────────────────────────
  useEffect(() => {
    if (!apiKey || !mapContainerRef.current) return
    let cancelled = false

    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !mapContainerRef.current) return
      if (mapRef.current) return // already initialized

      mapRef.current = new google.maps.Map(mapContainerRef.current, {
        center: { lat: 51.1657, lng: 10.4515 },
        zoom: 6,
        mapId: 'claimondo-dark',
        gestureHandling: 'greedy',
        disableDefaultUI: false,
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#212121' }] },
          { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
          { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
        ],
      })

      setMapReady(true)
    }).catch(err => console.error('[KarteClient] Maps load failed:', err))

    return () => { cancelled = true }
  }, [apiKey]) // runs ONCE

  // ─── SCHRITT 2: SV Marker + Circles erstellen ──────────────────
  // Dependency: [sachverstaendige, mapReady] - NICHT selectedSV!
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    // Alte Marker/Circles aufräumen
    markersRef.current.forEach(m => m.setMap(null))
    circlesRef.current.forEach(c => c.setMap(null))
    markersRef.current = []
    circlesRef.current = []

    sachverstaendige.forEach(sv => {
      if (sv.standortLat == null || sv.standortLng == null) return

      const pos = { lat: sv.standortLat, lng: sv.standortLng }
      const color = TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6'

      // Circle (Coverage)
      const circle = new google.maps.Circle({
        center: pos,
        radius: (sv.radiusKm || 20) * 700,
        map: mapRef.current!,
        fillColor: color,
        fillOpacity: 0.12,
        strokeColor: color,
        strokeOpacity: 0.4,
        strokeWeight: 1.5,
        clickable: true,
      })
      circle.addListener('click', () => {
        setSelectedSV(sv)
      })
      circlesRef.current.push(circle)

      // Marker
      const marker = new google.maps.Marker({
        position: pos,
        map: mapRef.current!,
        title: sv.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      })
      marker.addListener('click', () => {
        setSelectedSV(sv)
      })
      markersRef.current.push(marker)
    })
  }, [sachverstaendige, mapReady]) // NICHT selectedSV in den deps!

  // ─── SCHRITT 3: Fall Marker erstellen ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    fallMarkersRef.current.forEach(m => m.setMap(null))
    fallMarkersRef.current = []

    // Nur Fälle mit Adresse geocoden wir hier NICHT (zu teuer).
    // Fall-Marker werden nur angezeigt wenn sie Koordinaten hätten.
    // Für jetzt: keine Fall-Marker auf der Karte (nur in der Sidebar).
  }, [faelle, mapReady])

  // ─── Sidebar Filter ────────────────────────────────────────────
  const filteredSVs = search
    ? sachverstaendige.filter(sv => sv.name.toLowerCase().includes(search.toLowerCase()))
    : sachverstaendige

  // ─── Render ────────────────────────────────────────────────────
  if (!apiKey) return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center max-w-md">
        <p className="text-white font-medium mb-2">Google Maps API Key fehlt</p>
        <p className="text-zinc-500 text-sm">NEXT_PUBLIC_GOOGLE_MAPS_KEY in .env.local setzen</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen">
      {/* ─── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-white">Karte</h1>
              <p className="text-zinc-500 text-xs mt-0.5">{sachverstaendige.length} SV</p>
            </div>
            <button onClick={() => setShowOnboarding(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors">
              <UserPlusIcon className="w-3.5 h-3.5" /> Neu
            </button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700" />
          </div>
        </div>

        {/* SV Liste */}
        <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-zinc-800">
          {filteredSVs.map(sv => {
            const ti = TYP_COLORS[sv.gutachterTyp]
            return (
              <button key={sv.id}
                onClick={() => {
                  setSelectedSV(sv)
                  // Zoom zur Position
                  if (mapRef.current && sv.standortLat && sv.standortLng) {
                    mapRef.current.panTo({ lat: sv.standortLat, lng: sv.standortLng })
                    mapRef.current.setZoom(12)
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                  selectedSV?.id === sv.id ? 'bg-blue-600/20 border border-blue-600/30' : 'hover:bg-zinc-800/60'
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${ti?.marker ?? 'bg-blue-500'}`} />
                  <span className="text-zinc-200 text-sm truncate">{sv.name}</span>
                </div>
                <span className="text-zinc-600 text-[10px] ml-4.5">{PAKET_LABEL[sv.paket] ?? sv.paket} · {sv.offeneFaelle}/{sv.maxFaelleMonat}</span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ─── Map Container (native div, KEIN React-Component) ──── */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* ─── Onboarding Slide-Over (Portal, beeinflusst Map NICHT) */}
      <GutachterSlideOver open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* ─── SV Profil-Panel (fixed overlay, beeinflusst Map NICHT) */}
      {selectedSV && (
        <div className="fixed top-0 right-0 h-screen w-[400px] z-50 backdrop-blur-xl bg-zinc-900/95 border-l border-zinc-700/50 shadow-2xl overflow-y-auto">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${TYP_COLORS[selectedSV.gutachterTyp]?.marker ?? 'bg-blue-500'}`}>
                  {(selectedSV.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedSV.name || 'Unbekannt'}</h2>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${TYP_COLORS[selectedSV.gutachterTyp]?.marker ?? 'bg-blue-500'}`}>
                    {TYP_COLORS[selectedSV.gutachterTyp]?.label ?? selectedSV.gutachterTyp}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedSV(null)} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Kontakt */}
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Kontakt</h3>
                {selectedSV.telefon && (
                  <a href={`tel:${selectedSV.telefon}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 mb-1">
                    <PhoneIcon className="w-3.5 h-3.5" /> {selectedSV.telefon}
                  </a>
                )}
                {selectedSV.email && (
                  <a href={`mailto:${selectedSV.email}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                    <MailIcon className="w-3.5 h-3.5" /> {selectedSV.email}
                  </a>
                )}
              </section>

              {/* Standort */}
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Standort</h3>
                <p className="text-sm text-zinc-300">{selectedSV.standortAdresse ?? '\u2014'}</p>
              </section>

              {/* Paket + Auslastung */}
              <section>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Paket & Auslastung</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-white">{PAKET_LABEL[selectedSV.paket] ?? selectedSV.paket ?? '\u2014'}</p>
                    <p className="text-[10px] text-zinc-500">Paket</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-white">{selectedSV.radiusKm}km</p>
                    <p className="text-[10px] text-zinc-500">Radius</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-white">{selectedSV.guthaben != null ? `${selectedSV.guthaben}\u20AC` : '\u2014'}</p>
                    <p className="text-[10px] text-zinc-500">Guthaben</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-400">Faelle</span>
                  <span className="text-xs text-zinc-300 tabular-nums">{selectedSV.offeneFaelle}/{selectedSV.maxFaelleMonat}</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, selectedSV.maxFaelleMonat > 0 ? (selectedSV.offeneFaelle / selectedSV.maxFaelleMonat) * 100 : 0)}%` }} />
                </div>
              </section>

              {/* Qualifikationen */}
              {(selectedSV.qualifikationen ?? []).length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Qualifikationen</h3>
                  <div className="flex flex-wrap gap-1">
                    {(selectedSV.qualifikationen ?? []).map(q => (
                      <span key={q} className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-full">{q}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Aktionen */}
              <section className="border-t border-zinc-800 pt-4 space-y-2">
                <div className="flex gap-2">
                  {selectedSV.telefon && (
                    <a href={`tel:${selectedSV.telefon}`} className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                      <PhoneIcon className="w-3.5 h-3.5" /> Anrufen
                    </a>
                  )}
                  {selectedSV.email && (
                    <a href={`mailto:${selectedSV.email}`} className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                      <MailIcon className="w-3.5 h-3.5" /> E-Mail
                    </a>
                  )}
                </div>
                <Link href={`/admin/sachverstaendige/${selectedSV.id}`}
                  className="block text-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                  Profil bearbeiten
                </Link>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
