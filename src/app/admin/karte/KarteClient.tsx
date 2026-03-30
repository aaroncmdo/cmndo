'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps'
import { SearchIcon, XIcon, AlertTriangleIcon, UserPlusIcon, PhoneIcon, MailIcon } from 'lucide-react'
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

interface GeocodedSV extends SV { lat: number; lng: number }
interface GeocodedFall extends Fall { lat: number; lng: number }

// ═══════════════════════════════════════════════════════════════════════════
// Constants (module-level, stable references)
// ═══════════════════════════════════════════════════════════════════════════

import { FALL_STATUS_LABELS } from '@/lib/statusLabels'

const TYP_INFO: Record<string, { fill: string; marker: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', marker: 'bg-blue-500', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', marker: 'bg-orange-500', label: 'DAT' },
  akademie: { fill: '#22c55e', marker: 'bg-green-500', label: 'Akademie' },
  gutachterbuero: { fill: '#a855f7', marker: 'bg-purple-500', label: 'Buero' },
}
const DEFAULT_TYP = { fill: '#3b82f6', marker: 'bg-blue-500', label: '—' }

const PAKET_LABEL: Record<string, string> = {
  'starter-10': 'Starter', starter: 'Starter',
  'standard-25': 'Standard', pro: 'Standard',
  'premium-50': 'Premium', premium: 'Premium',
}

const DARK_MAP_ID = 'claimondo-dark'
const DEFAULT_CENTER = { lat: 51.1657, lng: 10.4515 }
const MAPS_LIBRARIES: ('places')[] = ['places'] // module-level constant, stable reference

// ═══════════════════════════════════════════════════════════════════════════
// Geocoding helpers (module-level, NOT re-created per render)
// ═══════════════════════════════════════════════════════════════════════════

const geoCache: Record<string, { lat: number; lng: number } | null> = {}

async function geocode(geocoder: google.maps.Geocoder, addr: string) {
  if (addr in geoCache) return geoCache[addr]
  try {
    const r = await geocoder.geocode({ address: addr + ', Deutschland' })
    if (r.results.length > 0) {
      const loc = r.results[0].geometry.location
      const c = { lat: loc.lat(), lng: loc.lng() }
      geoCache[addr] = c
      return c
    }
  } catch { /* */ }
  geoCache[addr] = null
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Coverage circle (imperative Google Maps API, NO re-render on prop changes)
// The circle is created ONCE and updated via refs. This is the key fix:
// React state changes (like selectedSV) do NOT cause circle destroy/recreate.
// ═══════════════════════════════════════════════════════════════════════════

function CoverageCircle({ lat, lng, radiusKm, color, onClickSvId, onSelectSv }: {
  lat: number; lng: number; radiusKm: number; color: string
  onClickSvId: string; onSelectSv: (id: string) => void
}) {
  const map = useMap()
  const circleRef = useRef<google.maps.Circle | null>(null)
  const onSelectRef = useRef(onSelectSv)
  onSelectRef.current = onSelectSv
  const svIdRef = useRef(onClickSvId)
  svIdRef.current = onClickSvId

  useEffect(() => {
    if (!map) return
    const circle = new google.maps.Circle({
      map, center: { lat, lng }, radius: radiusKm * 700,
      fillColor: color, fillOpacity: 0.15,
      strokeColor: color, strokeOpacity: 0.5, strokeWeight: 1.5,
      clickable: true,
    })
    circle.addListener('click', () => onSelectRef.current(svIdRef.current))
    circleRef.current = circle
    return () => {
      try { google.maps.event.clearInstanceListeners(circle) } catch {}
      circle.setMap(null)
    }
  }, [map, lat, lng, radiusKm, color]) // NO callback in deps

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

export default function KarteClient({ sachverstaendige, faelle }: { sachverstaendige: SV[]; faelle: Fall[] }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

  // ─── State ─────────────────────────────────────────────────────────
  const [geocodedSVs, setGeocodedSVs] = useState<GeocodedSV[]>([])
  const [geocodedFaelle, setGeocodedFaelle] = useState<GeocodedFall[]>([])
  const [selectedSvId, setSelectedSvId] = useState<string | null>(null)
  const [selectedFall, setSelectedFall] = useState<GeocodedFall | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Derive selectedSV from ID (avoids stale object references)
  const selectedSV = useMemo(
    () => selectedSvId ? geocodedSVs.find(sv => sv.id === selectedSvId) ?? null : null,
    [selectedSvId, geocodedSVs]
  )

  // ─── Geocoding (runs ONCE on API load, guarded by ref) ────────────
  const geocodedRef = useRef(false)
  const handleApiLoad = useCallback(async () => {
    if (geocodedRef.current) return // prevent double-fire
    geocodedRef.current = true
    const g = new google.maps.Geocoder()
    const svR = await Promise.all(sachverstaendige.map(async sv => {
      if (sv.standortLat != null && sv.standortLng != null) return { ...sv, lat: sv.standortLat, lng: sv.standortLng } as GeocodedSV
      const plz = sv.gebietPlz[0]
      if (!plz) return null
      const c = await geocode(g, plz)
      return c ? { ...sv, ...c } as GeocodedSV : null
    }))
    const fR = await Promise.all(faelle.map(async f => {
      const addr = f.adresse || f.schadensPLZ || f.schadensOrt
      if (!addr) return null
      const c = await geocode(g, addr)
      return c ? { ...f, ...c } as GeocodedFall : null
    }))
    setGeocodedSVs(svR.filter((s): s is GeocodedSV => s !== null))
    setGeocodedFaelle(fR.filter((f): f is GeocodedFall => f !== null))
    setLoading(false)
  }, [sachverstaendige, faelle])

  // ─── Filtered lists (memoized, stable) ────────────────────────────
  const filteredSVs = useMemo(() => {
    if (!search) return geocodedSVs
    const q = search.toLowerCase()
    return geocodedSVs.filter(sv => sv.name.toLowerCase().includes(q))
  }, [geocodedSVs, search])

  const filteredFaelle = useMemo(() => {
    if (!search) return geocodedFaelle
    const q = search.toLowerCase()
    return geocodedFaelle.filter(f => f.fallNummer.toLowerCase().includes(q) || f.kunde.toLowerCase().includes(q))
  }, [geocodedFaelle, search])

  // ─── Stable callbacks (useCallback, NOT inline arrows in JSX) ─────
  const handleSelectSv = useCallback((svId: string) => {
    setSelectedSvId(svId)
    setSelectedFall(null)
  }, [])

  const handleCloseSv = useCallback(() => setSelectedSvId(null), [])

  // ─── Render ────────────────────────────────────────────────────────
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
              <p className="text-zinc-500 text-xs mt-0.5">{sachverstaendige.length} SV &middot; {faelle.length} Faelle</p>
            </div>
            <button onClick={() => setShowOnboarding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors">
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
          <p className="text-xs text-zinc-500 font-medium px-2 py-1.5">Gutachter ({filteredSVs.length})</p>
          {filteredSVs.map(sv => {
            const ti = TYP_INFO[sv.gutachterTyp] ?? DEFAULT_TYP
            return (
              <button key={sv.id} onClick={() => handleSelectSv(sv.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${selectedSvId === sv.id ? 'bg-blue-600/20 border border-blue-600/30' : 'hover:bg-zinc-800/60'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${ti.marker}`} />
                  <span className="text-zinc-200 text-sm truncate">{sv.name}</span>
                </div>
                <span className="text-zinc-600 text-[10px] pl-4.5">{PAKET_LABEL[sv.paket] ?? sv.paket} &middot; {sv.offeneFaelle}/{sv.maxFaelleMonat}</span>
              </button>
            )
          })}
          <p className="text-xs text-zinc-500 font-medium px-2 py-1.5 mt-3">Faelle ({filteredFaelle.length})</p>
          {filteredFaelle.map(f => (
            <button key={f.id} onClick={() => { setSelectedFall(f); setSelectedSvId(null) }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors">
              <span className="text-blue-400 text-xs font-mono">{f.fallNummer}</span>
              <span className="text-zinc-500 text-xs block truncate">{f.schadensOrt ?? f.adresse}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* ─── Map ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <APIProvider apiKey={apiKey} onLoad={handleApiLoad} libraries={MAPS_LIBRARIES}>
          <Map defaultCenter={DEFAULT_CENTER} defaultZoom={6} mapId={DARK_MAP_ID} gestureHandling="greedy" disableDefaultUI={false} className="w-full h-full">

            {/* Coverage circles (imperative, stable) */}
            {filteredSVs.map(sv => (
              <CoverageCircle
                key={`c-${sv.id}`}
                lat={sv.lat}
                lng={sv.lng}
                radiusKm={sv.radiusKm}
                color={(TYP_INFO[sv.gutachterTyp] ?? DEFAULT_TYP).fill}
                onClickSvId={sv.id}
                onSelectSv={handleSelectSv}
              />
            ))}

            {/* SV Markers */}
            {filteredSVs.map(sv => {
              const ti = TYP_INFO[sv.gutachterTyp] ?? DEFAULT_TYP
              return (
                <AdvancedMarker key={sv.id} position={{ lat: sv.lat, lng: sv.lng }} onClick={() => handleSelectSv(sv.id)}>
                  <div className="relative flex items-center justify-center">
                    <div className={`w-5 h-5 rounded-full border-2 border-white shadow-lg cursor-pointer ${selectedSvId === sv.id ? 'scale-150' : ''} ${ti.marker}`}
                      style={{ transition: 'transform 0.15s' }} />
                    <span className="absolute -bottom-5 text-[10px] font-medium text-white bg-zinc-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {(sv.name ?? '?').split(' ')[0]}
                    </span>
                  </div>
                </AdvancedMarker>
              )
            })}

            {/* Fall Markers */}
            {filteredFaelle.map(f => (
              <AdvancedMarker key={f.id} position={{ lat: f.lat, lng: f.lng }} onClick={() => { setSelectedFall(f); setSelectedSvId(null) }}>
                <div className="w-4 h-4 rounded-full border-2 border-white shadow-lg bg-red-500 cursor-pointer" />
              </AdvancedMarker>
            ))}

            {/* Fall InfoWindow */}
            {selectedFall && (
              <InfoWindow position={{ lat: selectedFall.lat, lng: selectedFall.lng }} onCloseClick={() => setSelectedFall(null)}>
                <div className="p-1 min-w-[180px]">
                  <h3 className="font-semibold text-sm text-zinc-900 font-mono mb-1">{selectedFall.fallNummer}</h3>
                  <p className="text-xs text-zinc-600"><b>Status:</b> {FALL_STATUS_LABELS[selectedFall.status] ?? selectedFall.status}</p>
                  <p className="text-xs text-zinc-600"><b>Kunde:</b> {selectedFall.kunde}</p>
                  <Link href={`/admin/faelle/${selectedFall.id}`} className="inline-block mt-2 text-xs text-blue-600 font-medium">Zur Fallakte &rarr;</Link>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>

      {/* ─── Onboarding Slide-Over ────────────────────────────────── */}
      <GutachterSlideOver open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* ─── SV Profil-Panel (inline, simple, no separate component) ─ */}
      {selectedSV && (
        <div className="fixed top-0 right-0 h-screen w-[400px] z-50 backdrop-blur-xl bg-zinc-900/95 border-l border-zinc-700/50 shadow-2xl overflow-y-auto">
          <div className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${(TYP_INFO[selectedSV.gutachterTyp] ?? DEFAULT_TYP).marker}`}>
                  {(selectedSV.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedSV.name || 'Unbekannt'}</h2>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${(TYP_INFO[selectedSV.gutachterTyp] ?? DEFAULT_TYP).marker}`}>
                    {(TYP_INFO[selectedSV.gutachterTyp] ?? DEFAULT_TYP).label}
                  </span>
                </div>
              </div>
              <button onClick={handleCloseSv} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
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
                  <div className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(100, selectedSV.maxFaelleMonat > 0 ? (selectedSV.offeneFaelle / selectedSV.maxFaelleMonat) * 100 : 0)}%` }} />
                </div>
                {selectedSV.anzahlungStatus && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-zinc-500">Anzahlung</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      selectedSV.anzahlungStatus === 'bezahlt' ? 'bg-emerald-500/20 text-emerald-400' :
                      selectedSV.anzahlungStatus === 'teilweise' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {selectedSV.anzahlungStatus === 'bezahlt' ? 'Bezahlt' : selectedSV.anzahlungStatus === 'teilweise' ? 'Teilweise' : 'Offen'}
                    </span>
                  </div>
                )}
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
