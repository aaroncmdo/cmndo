'use client'

import { useEffect, useState, useRef } from 'react'
import { SearchIcon, XIcon, UserPlusIcon, PhoneIcon, MailIcon, MapPinIcon, PencilIcon, CheckIcon, PowerOffIcon } from 'lucide-react'
import Link from 'next/link'
import GutachterSlideOver from './GutachterSlideOver'
import { updateGutachterProfil } from './actions'

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
// Constants (module-level, stable references, never re-created)
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

// Paket → Radius in meters (with 0.7 correction factor: Luftlinie → Fahrstrecke)
const PAKET_RADIUS_M: Record<string, number> = {
  'starter-10': 14000, starter: 14000,
  'standard-25': 28000, pro: 28000,
  'premium-50': 70000, premium: 70000,
}

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

  // ─── SV Markers (dep: [sachverstaendige, mapReady] ONLY) ──────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    // Cleanup old
    markersRef.current.forEach(m => { google.maps.event.clearInstanceListeners(m); m.setMap(null) })
    markersRef.current = []

    sachverstaendige.forEach(sv => {
      if (sv.standortLat == null || sv.standortLng == null) return
      const pos = { lat: sv.standortLat, lng: sv.standortLng }
      const color = TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6'
      const marker = new google.maps.Marker({
        position: pos, map: mapRef.current!, title: sv.name,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      })
      marker.addListener('click', () => setSelectedSV(sv))
      markersRef.current.push(marker)
    })
  }, [sachverstaendige, mapReady])

  // ─── Coverage areas: Isochronen-Polygone (OSRM) ──────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return

    // Cleanup old polygons
    polygonsRef.current.forEach(p => { google.maps.event.clearInstanceListeners(p); p.setMap(null) })
    polygonsRef.current = []

    sachverstaendige.forEach(sv => {
      if (sv.standortLat == null || sv.standortLng == null) return
      const color = TYP_COLORS[sv.gutachterTyp]?.fill ?? '#3b82f6'

      fetchIsochrone(sv.standortLat, sv.standortLng, sv.radiusKm).then(points => {
        if (!mapRef.current || !points.length) return
        const polygon = new google.maps.Polygon({
          paths: points, map: mapRef.current,
          fillColor: color, fillOpacity: 0.12,
          strokeColor: color, strokeOpacity: 0.5, strokeWeight: 2,
          clickable: true, geodesic: true,
        })
        polygon.addListener('click', () => setSelectedSV(sv))
        polygon.addListener('mouseover', () => { polygon.setOptions({ fillOpacity: 0.25, strokeWeight: 3 }) })
        polygon.addListener('mouseout', () => { polygon.setOptions({ fillOpacity: 0.12, strokeWeight: 2 }) })
        polygonsRef.current.push(polygon)
      })
    })
  }, [sachverstaendige, mapReady])

  // ─── Sidebar filter (no useEffect, just derived) ──────────────
  const filteredSVs = search
    ? sachverstaendige.filter(sv => sv.name.toLowerCase().includes(search.toLowerCase()))
    : sachverstaendige

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
              <p className="text-gray-500 text-xs mt-0.5">{sachverstaendige.length} SV</p>
            </div>
            <button onClick={() => setShowOnboarding(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-900 bg-blue-600 hover:bg-blue-500 transition-colors">
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
                  selectedSV?.id === sv.id ? 'bg-blue-600/20 border border-blue-600/30' : 'hover:bg-gray-100/60'
                }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${ti?.marker ?? 'bg-blue-500'}`} />
                  <span className="text-gray-800 text-sm truncate">{sv.name}</span>
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
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
              <p className="text-[10px] text-gray-500">Starter: 14km</p>
              <p className="text-[10px] text-gray-500">Standard: 28km</p>
              <p className="text-[10px] text-gray-500">Premium: 70km</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Onboarding (fixed overlay, does NOT affect map) ──────── */}
      <GutachterSlideOver open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* ─── Profil-Panel (fixed overlay, does NOT affect map) ────── */}
      {selectedSV && (
        <ProfilPanel sv={selectedSV} onClose={() => setSelectedSV(null)} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Editable Profil-Panel (separate component, pure overlay)
// ═══════════════════════════════════════════════════════════════════════════

function ProfilPanel({ sv, onClose }: { sv: SV; onClose: () => void }) {
  // Editable state
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingQual, setEditingQual] = useState(false)
  const [quals, setQuals] = useState<string[]>(sv.qualifikationen ?? [])
  const [notiz, setNotiz] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const auslPct = sv.maxFaelleMonat > 0 ? Math.round((sv.offeneFaelle / sv.maxFaelleMonat) * 100) : 0
  const ti = TYP_COLORS[sv.gutachterTyp] ?? { fill: '#3b82f6', marker: 'bg-blue-500', label: sv.gutachterTyp }

  useEffect(() => { if (editField) inputRef.current?.focus() }, [editField])

  async function saveField(field: string, value: unknown) {
    setSaving(true)
    try { await updateGutachterProfil(sv.id, field, value) } catch { /* */ }
    setSaving(false)
    setEditField(null)
  }

  async function saveQuals() {
    setSaving(true)
    try { await updateGutachterProfil(sv.id, 'qualifikationen', quals) } catch { /* */ }
    setSaving(false)
    setEditingQual(false)
  }

  function startEdit(field: string, currentValue: string) {
    setEditField(field)
    setEditValue(currentValue)
  }

  return (
    <div className="fixed top-0 right-0 h-screen w-[400px] z-50 backdrop-blur-xl bg-white/95 border-l border-gray-300/50 shadow-2xl overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-gray-900 font-bold text-sm ${ti.marker}`}>
              {(sv.name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{sv.name || 'Unbekannt'}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-gray-900 ${ti.marker}`}>{ti.label}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">Aktiv</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* ─── Kontakt (bearbeitbar) ─────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Kontakt</h3>
            <EditableRow label="Telefon" value={sv.telefon ?? ''} field="telefon" linkPrefix="tel:"
              editField={editField} editValue={editValue} inputRef={inputRef} saving={saving}
              onStartEdit={startEdit} onSave={saveField} onEditValueChange={setEditValue} onCancel={() => setEditField(null)} />
            <EditableRow label="E-Mail" value={sv.email ?? ''} field="email" linkPrefix="mailto:" type="email"
              editField={editField} editValue={editValue} inputRef={inputRef} saving={saving}
              onStartEdit={startEdit} onSave={saveField} onEditValueChange={setEditValue} onCancel={() => setEditField(null)} />
          </section>

          {/* ─── Standort ─────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Standort</h3>
            <div className="flex items-start gap-2">
              <MapPinIcon className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-sm text-gray-700">{sv.standortAdresse ?? '\u2014'}</p>
            </div>
            {sv.standortLat != null && sv.standortLng != null && (
              <p className="text-[10px] text-gray-400 mt-1 ml-6">{sv.standortLat.toFixed(4)}, {sv.standortLng.toFixed(4)}</p>
            )}
          </section>

          {/* ─── Paket + Auslastung ───────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Paket & Auslastung</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-gray-100/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{PAKET_LABEL[sv.paket] ?? sv.paket ?? '\u2014'}</p>
                <p className="text-[10px] text-gray-500">Paket</p>
              </div>
              <div className="bg-gray-100/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{sv.radiusKm}km</p>
                <p className="text-[10px] text-gray-500">Radius</p>
              </div>
              <div className="bg-gray-100/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{sv.guthaben != null ? `${sv.guthaben}\u20AC` : '\u2014'}</p>
                <p className="text-[10px] text-gray-500">Guthaben</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Faelle</span>
              <span className="text-xs text-gray-700 tabular-nums">{sv.offeneFaelle}/{sv.maxFaelleMonat} ({auslPct}%)</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${auslPct >= 90 ? 'bg-red-500' : auslPct >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(100, auslPct)}%` }} />
            </div>
            {sv.anzahlungStatus && (
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">Anzahlung</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  sv.anzahlungStatus === 'bezahlt' ? 'bg-emerald-500/20 text-emerald-400' :
                  sv.anzahlungStatus === 'teilweise' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {sv.anzahlungStatus === 'bezahlt' ? 'Bezahlt' : sv.anzahlungStatus === 'teilweise' ? 'Teilweise' : 'Offen'}
                </span>
              </div>
            )}
          </section>

          {/* ─── Qualifikationen (bearbeitbar) ────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Qualifikationen</h3>
              <button onClick={() => editingQual ? saveQuals() : setEditingQual(true)} disabled={saving}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">
                {saving ? 'Speichert...' : editingQual ? 'Speichern' : 'Bearbeiten'}
              </button>
            </div>
            {editingQual ? (
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_QUALIFIKATIONEN.map(q => (
                  <label key={q} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={quals.includes(q)}
                      onChange={e => setQuals(prev => e.target.checked ? [...prev, q] : prev.filter(x => x !== q))}
                      className="accent-blue-500 w-3.5 h-3.5 rounded" />
                    {q}
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(sv.qualifikationen ?? []).length > 0
                  ? (sv.qualifikationen ?? []).map(q => <span key={q} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">{q}</span>)
                  : <span className="text-gray-400 text-xs">Keine Qualifikationen</span>}
              </div>
            )}
          </section>

          {/* ─── Admin-Notizen ────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin-Notizen</h3>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)}
              onBlur={() => { if (notiz) updateGutachterProfil(sv.id, 'notizen', notiz).catch(() => {}) }}
              placeholder="Interne Notizen..." rows={2}
              className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-400 resize-y" />
          </section>

          {/* ─── Aktionen ─────────────────────────────────────────── */}
          <section className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex gap-2">
              {sv.telefon && (
                <a href={`tel:${sv.telefon}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  <PhoneIcon className="w-3.5 h-3.5" /> Anrufen
                </a>
              )}
              {sv.email && (
                <a href={`mailto:${sv.email}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  <MailIcon className="w-3.5 h-3.5" /> E-Mail
                </a>
              )}
            </div>
            <Link href={`/admin/sachverstaendige/${sv.id}`}
              className="block text-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
              Vollstaendiges Profil
            </Link>
            <button onClick={async () => {
              if (!confirm('Gutachter wirklich deaktivieren?')) return
              await updateGutachterProfil(sv.id, 'ist_aktiv', false).catch(() => {})
              onClose()
            }} className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 text-sm py-2 transition-colors">
              <PowerOffIcon className="w-3.5 h-3.5" /> Deaktivieren
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Inline-editable row (shared by telefon + email)
// ═══════════════════════════════════════════════════════════════════════════

function EditableRow({ label, value, field, linkPrefix, type, editField, editValue, inputRef, saving, onStartEdit, onSave, onEditValueChange, onCancel }: {
  label: string; value: string; field: string; linkPrefix?: string; type?: string
  editField: string | null; editValue: string; inputRef: React.RefObject<HTMLInputElement | null>; saving: boolean
  onStartEdit: (field: string, value: string) => void
  onSave: (field: string, value: unknown) => void
  onEditValueChange: (v: string) => void
  onCancel: () => void
}) {
  if (editField === field) {
    return (
      <div className="flex items-center gap-1 mb-1.5">
        <input ref={inputRef} type={type ?? 'text'} value={editValue} onChange={e => onEditValueChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(field, editValue); if (e.key === 'Escape') onCancel() }}
          disabled={saving}
          className="flex-1 bg-gray-100 border border-blue-600 text-gray-800 text-sm rounded-lg px-2 py-1.5 focus:outline-none" />
        <button onClick={() => onSave(field, editValue)} disabled={saving} className="p-1 text-blue-400 hover:text-blue-300">
          <CheckIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 mb-1.5 group">
      {linkPrefix && value ? (
        <a href={`${linkPrefix}${value}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 flex-1 min-w-0 truncate">
          {field === 'telefon' ? <PhoneIcon className="w-3.5 h-3.5 shrink-0" /> : <MailIcon className="w-3.5 h-3.5 shrink-0" />}
          {value}
        </a>
      ) : (
        <span className="text-sm text-gray-700 flex-1">{value || '\u2014'}</span>
      )}
      <button onClick={() => onStartEdit(field, value)}
        className="p-1 text-gray-400 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
        <PencilIcon className="w-3 h-3" />
      </button>
    </div>
  )
}
