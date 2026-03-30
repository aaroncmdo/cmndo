'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps'
import { SearchIcon, XIcon, AlertTriangleIcon, UserPlusIcon } from 'lucide-react'
import Link from 'next/link'
import GutachterSlideOver from './GutachterSlideOver'

// ---------- Types ----------

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

// ---------- Constants ----------

import { FALL_STATUS_LABELS } from '@/lib/statusLabels'

const STATUS_LABEL = FALL_STATUS_LABELS

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden', sachbeschaedigung: 'Sachbeschädigung', brand: 'Brand',
  einbruch: 'Einbruch', sturmschaden: 'Sturmschaden', vandalismus: 'Vandalismus', sonstiges: 'Sonstiges',
}

const PAKET_COLORS: Record<string, { fill: string; stroke: string; marker: string; label: string }> = {
  'starter-10': { fill: '#3b82f6', stroke: '#3b82f6', marker: 'bg-blue-500', label: 'Starter' },
  starter: { fill: '#3b82f6', stroke: '#3b82f6', marker: 'bg-blue-500', label: 'Starter' },
  'standard-25': { fill: '#22c55e', stroke: '#22c55e', marker: 'bg-green-500', label: 'Standard' },
  pro: { fill: '#22c55e', stroke: '#22c55e', marker: 'bg-green-500', label: 'Pro' },
  'premium-50': { fill: '#eab308', stroke: '#eab308', marker: 'bg-yellow-500', label: 'Premium' },
  premium: { fill: '#eab308', stroke: '#eab308', marker: 'bg-yellow-500', label: 'Premium' },
}
const DEFAULT_PAKET_COLOR = { fill: '#3b82f6', stroke: '#3b82f6', marker: 'bg-blue-500', label: '—' }

const TYP_COLORS: Record<string, { fill: string; stroke: string; marker: string; label: string }> = {
  'kfz-gutachter': { fill: '#3b82f6', stroke: '#3b82f6', marker: 'bg-blue-500', label: 'KFZ-SV' },
  'dat-gutachter': { fill: '#f97316', stroke: '#f97316', marker: 'bg-orange-500', label: 'DAT' },
  'akademie': { fill: '#22c55e', stroke: '#22c55e', marker: 'bg-green-500', label: 'Akademie' },
  'gutachterbuero': { fill: '#a855f7', stroke: '#a855f7', marker: 'bg-purple-500', label: 'Buero' },
}
const DEFAULT_TYP_COLOR = { fill: '#3b82f6', stroke: '#3b82f6', marker: 'bg-blue-500', label: '—' }

const DARK_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
]

const DEFAULT_CENTER = { lat: 51.1657, lng: 10.4515 }
const DEFAULT_ZOOM = 6

// ---------- Helpers ----------

const geocodeCache: Record<string, { lat: number; lng: number } | null> = {}

async function geocodeAddress(geocoder: google.maps.Geocoder, address: string) {
  if (address in geocodeCache) return geocodeCache[address]
  try {
    const result = await geocoder.geocode({ address: address + ', Deutschland' })
    if (result.results.length > 0) {
      const loc = result.results[0].geometry.location
      const coords = { lat: loc.lat(), lng: loc.lng() }
      geocodeCache[address] = coords
      return coords
    }
  } catch { /* */ }
  geocodeCache[address] = null
  return null
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ---------- Isochrone polygon cache (client-side) ----------

const isochroneCache: Record<string, { lat: number; lng: number }[]> = {}

async function fetchIsochrone(lat: number, lng: number, radiusKm: number): Promise<{ lat: number; lng: number }[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusKm}`
  if (isochroneCache[key]) return isochroneCache[key]
  try {
    const res = await fetch(`/api/isochrone?lat=${lat}&lng=${lng}&radius_km=${Math.round(radiusKm * 0.7)}`)
    if (!res.ok) return []
    const data = await res.json()
    if (data.polygon) {
      isochroneCache[key] = data.polygon
      return data.polygon
    }
  } catch { /* */ }
  return []
}

// ---------- Map sub-components ----------

function RadiusCircle({ center, radiusKm, color, opacity }: { center: { lat: number; lng: number }; radiusKm: number; color: string; opacity?: number }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const circle = new google.maps.Circle({ map, center, radius: radiusKm * 0.7 * 1000, fillColor: color, fillOpacity: opacity ?? 0.2, strokeColor: color, strokeOpacity: 0.6, strokeWeight: 2 })
    return () => circle.setMap(null)
  }, [map, center, radiusKm, color, opacity])
  return null
}

function IsochronePolygon({ center, radiusKm, color, opacity }: { center: { lat: number; lng: number }; radiusKm: number; color: string; opacity?: number }) {
  const map = useMap()
  const polygonRef = useRef<google.maps.Polygon | null>(null)

  useEffect(() => {
    if (!map) return

    let cancelled = false

    fetchIsochrone(center.lat, center.lng, radiusKm).then(points => {
      if (cancelled || !points.length) return

      const path = points.map(p => ({ lat: p.lat, lng: p.lng }))

      polygonRef.current = new google.maps.Polygon({
        map,
        paths: path,
        fillColor: color,
        fillOpacity: opacity ?? 0.2,
        strokeColor: color,
        strokeOpacity: 0.6,
        strokeWeight: 2,
        geodesic: true,
      })
    })

    return () => {
      cancelled = true
      if (polygonRef.current) {
        polygonRef.current.setMap(null)
        polygonRef.current = null
      }
    }
  }, [map, center.lat, center.lng, radiusKm, color, opacity])

  return null
}

function CoverageGapOverlay({ uncoveredFaelle }: { uncoveredFaelle: GeocodedFall[] }) {
  const map = useMap()
  const polygonsRef = useRef<google.maps.Circle[]>([])

  useEffect(() => {
    // Clean up previous
    for (const p of polygonsRef.current) p.setMap(null)
    polygonsRef.current = []

    if (!map || uncoveredFaelle.length === 0) return

    // Cluster nearby uncovered falls into groups and draw red gap zones
    const clusters: { lat: number; lng: number; count: number; radius: number }[] = []
    const used = new Set<number>()

    for (let i = 0; i < uncoveredFaelle.length; i++) {
      if (used.has(i)) continue
      used.add(i)
      let sumLat = uncoveredFaelle[i].lat
      let sumLng = uncoveredFaelle[i].lng
      let count = 1
      let maxDist = 0

      for (let j = i + 1; j < uncoveredFaelle.length; j++) {
        if (used.has(j)) continue
        const dist = haversineKm(uncoveredFaelle[i].lat, uncoveredFaelle[i].lng, uncoveredFaelle[j].lat, uncoveredFaelle[j].lng)
        if (dist < 30) { // cluster within 30km
          used.add(j)
          sumLat += uncoveredFaelle[j].lat
          sumLng += uncoveredFaelle[j].lng
          count++
          if (dist > maxDist) maxDist = dist
        }
      }

      clusters.push({
        lat: sumLat / count,
        lng: sumLng / count,
        count,
        radius: Math.max(15, maxDist / 2 + 10), // minimum 15km radius for visibility
      })
    }

    for (const cluster of clusters) {
      const circle = new google.maps.Circle({
        map,
        center: { lat: cluster.lat, lng: cluster.lng },
        radius: cluster.radius * 1000,
        fillColor: '#ef4444',
        fillOpacity: 0.06,
        strokeColor: '#ef4444',
        strokeOpacity: 0.25,
        strokeWeight: 1.5,
        clickable: false,
        zIndex: -1,
      })
      polygonsRef.current.push(circle)
    }

    return () => {
      for (const p of polygonsRef.current) p.setMap(null)
      polygonsRef.current = []
    }
  }, [map, uncoveredFaelle])

  return null
}

function OrgLine({ from, to }: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }) {
  const map = useMap()
  useEffect(() => {
    if (!map) return
    const line = new google.maps.Polyline({
      map, path: [from, to], strokeColor: '#a855f7', strokeOpacity: 0.5, strokeWeight: 2, geodesic: true,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }],
    })
    return () => line.setMap(null)
  }, [map, from, to])
  return null
}

// ---------- Main ----------

export default function KarteClient({ sachverstaendige, faelle }: { sachverstaendige: SV[]; faelle: Fall[] }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [geocodedSVs, setGeocodedSVs] = useState<GeocodedSV[]>([])
  const [geocodedFaelle, setGeocodedFaelle] = useState<GeocodedFall[]>([])
  const [selectedSV, setSelectedSV] = useState<GeocodedSV | null>(null)
  const [selectedFall, setSelectedFall] = useState<GeocodedFall | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('alle')
  const [svFilter, setSvFilter] = useState('alle')
  const [paketFilter, setPaketFilter] = useState('alle')
  const [auslastungFilter, setAuslastungFilter] = useState('alle')
  const [search, setSearch] = useState('')
  const [showOrgs, setShowOrgs] = useState(true)
  const [coverageMode, setCoverageMode] = useState<'isochrone' | 'circle'>('isochrone')
  const [showGaps, setShowGaps] = useState(true)

  const handleApiLoad = useCallback(async () => {
    const geocoder = new google.maps.Geocoder()
    const svPromises = sachverstaendige.map(async (sv) => {
      if (sv.standortLat != null && sv.standortLng != null) return { ...sv, lat: sv.standortLat, lng: sv.standortLng } as GeocodedSV
      const plz = sv.gebietPlz[0]
      if (!plz) return null
      const coords = await geocodeAddress(geocoder, plz)
      return coords ? { ...sv, ...coords } as GeocodedSV : null
    })
    const fallPromises = faelle.map(async (fall) => {
      const addr = fall.adresse || fall.schadensPLZ || fall.schadensOrt
      if (!addr) return null
      const coords = await geocodeAddress(geocoder, addr)
      return coords ? { ...fall, ...coords } as GeocodedFall : null
    })
    const [svR, fR] = await Promise.all([Promise.all(svPromises), Promise.all(fallPromises)])
    setGeocodedSVs(svR.filter((s): s is GeocodedSV => s !== null))
    setGeocodedFaelle(fR.filter((f): f is GeocodedFall => f !== null))
    setLoading(false)
  }, [sachverstaendige, faelle])

  const statuses = useMemo(() => [...new Set(faelle.map(f => f.status))], [faelle])
  const pakete = useMemo(() => [...new Set(sachverstaendige.map(sv => sv.paket))], [sachverstaendige])

  const filteredFaelle = useMemo(() => geocodedFaelle.filter(f => {
    if (statusFilter !== 'alle' && f.status !== statusFilter) return false
    if (svFilter !== 'alle' && f.svId !== svFilter) return false
    if (search) { const q = search.toLowerCase(); if (!f.fallNummer.toLowerCase().includes(q) && !f.kunde.toLowerCase().includes(q) && !(f.schadensOrt ?? '').toLowerCase().includes(q)) return false }
    return true
  }), [geocodedFaelle, statusFilter, svFilter, search])

  const filteredSVs = useMemo(() => geocodedSVs.filter(sv => {
    if (svFilter !== 'alle' && sv.id !== svFilter) return false
    if (paketFilter !== 'alle' && sv.paket !== paketFilter) return false
    if (auslastungFilter === 'verfuegbar' && sv.offeneFaelle >= sv.maxFaelleMonat) return false
    if (auslastungFilter === 'voll' && sv.offeneFaelle < sv.maxFaelleMonat) return false
    return true
  }), [geocodedSVs, svFilter, paketFilter, auslastungFilter])

  const ueberlappungen = useMemo(() => {
    let count = 0
    for (let i = 0; i < filteredSVs.length; i++)
      for (let j = i + 1; j < filteredSVs.length; j++)
        if (haversineKm(filteredSVs[i].lat, filteredSVs[i].lng, filteredSVs[j].lat, filteredSVs[j].lng) < filteredSVs[i].radiusKm + filteredSVs[j].radiusKm) count++
    return count
  }, [filteredSVs])

  const uncoveredFaelle = useMemo(() => filteredFaelle.filter(f =>
    !geocodedSVs.some(sv => haversineKm(f.lat, f.lng, sv.lat, sv.lng) <= sv.radiusKm)
  ), [filteredFaelle, geocodedSVs])

  const orgConnections = useMemo(() => {
    if (!showOrgs) return []
    const orgMap: Record<string, GeocodedSV[]> = {}
    for (const sv of filteredSVs) { if (!sv.organisationId) continue; const l = orgMap[sv.organisationId] ?? []; l.push(sv); orgMap[sv.organisationId] = l }
    const conns: { from: GeocodedSV; to: GeocodedSV }[] = []
    for (const members of Object.values(orgMap)) for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) conns.push({ from: members[i], to: members[j] })
    return conns
  }, [filteredSVs, showOrgs])

  if (!apiKey) return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center max-w-md">
        <p className="text-white font-medium mb-2">Google Maps API Key fehlt</p>
        <p className="text-zinc-500 text-sm">Bitte setze <code className="text-blue-400">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in <code className="text-blue-400">.env.local</code></p>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      <aside className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-white">Karte</h1>
              <p className="text-zinc-500 text-xs mt-0.5">{sachverstaendige.length} SV &middot; {faelle.length} Faelle</p>
            </div>
            <button onClick={() => setShowOnboarding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white transition-colors" style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}>
              <UserPlusIcon className="w-3.5 h-3.5" /> Neu
            </button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche..." className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700" />
          </div>
        </div>
        <div className="px-4 space-y-3 pb-4">
          <Sel label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ v: 'alle', l: 'Alle Status' }, ...statuses.map(s => ({ v: s, l: STATUS_LABEL[s] ?? s }))]} />
          <Sel label="Sachverstaendiger" value={svFilter} onChange={setSvFilter} options={[{ v: 'alle', l: 'Alle SV' }, ...sachverstaendige.map(sv => ({ v: sv.id, l: sv.name }))]} />
          <Sel label="Paket" value={paketFilter} onChange={setPaketFilter} options={[{ v: 'alle', l: 'Alle Pakete' }, ...pakete.map(p => ({ v: p, l: PAKET_COLORS[p]?.label ?? p }))]} />
          <Sel label="Auslastung" value={auslastungFilter} onChange={setAuslastungFilter} options={[{ v: 'alle', l: 'Alle' }, { v: 'verfuegbar', l: 'Verfuegbar' }, { v: 'voll', l: 'Voll' }]} />
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showOrgs} onChange={e => setShowOrgs(e.target.checked)} className="w-4 h-4 rounded accent-purple-500" /><span className="text-xs text-zinc-400">Organisationen anzeigen</span></label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showGaps} onChange={e => setShowGaps(e.target.checked)} className="w-4 h-4 rounded accent-red-500" /><span className="text-xs text-zinc-400">Abdeckungsluecken anzeigen</span></label>
        </div>
        <div className="px-4 py-3 border-t border-zinc-800 space-y-2">
          <p className="text-xs text-zinc-500 font-medium">Abdeckung</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-zinc-900 rounded-lg px-3 py-2"><p className="text-lg font-semibold text-white">{filteredSVs.length}</p><p className="text-[10px] text-zinc-500">Gutachter</p></div>
            <div className="bg-zinc-900 rounded-lg px-3 py-2"><p className="text-lg font-semibold text-white">{ueberlappungen}</p><p className="text-[10px] text-zinc-500">Ueberlappungen</p></div>
          </div>
          {uncoveredFaelle.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-800/30">
              <AlertTriangleIcon className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-red-400">{uncoveredFaelle.length} Faelle ohne Abdeckung</span>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 font-medium mb-2">Darstellung</p>
          <div className="flex rounded-lg overflow-hidden border border-zinc-800">
            <button
              onClick={() => setCoverageMode('isochrone')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${coverageMode === 'isochrone' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-300'}`}
            >
              Isochronen
            </button>
            <button
              onClick={() => setCoverageMode('circle')}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${coverageMode === 'circle' ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-300'}`}
            >
              Kreise
            </button>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 font-medium mb-2">Gutachter-Typen</p>
          <div className="space-y-1.5">
            <Leg color="bg-blue-500" label="KFZ-Gutachter" />
            <Leg color="bg-orange-500" label="DAT-Gutachter" />
            <Leg color="bg-green-500" label="Akademie" />
            <Leg color="bg-purple-500" label="Gutachterbuero" />
            <Leg color="bg-red-500" label="Offener Fall" />
            {showGaps && <LegPatterned color="bg-red-500/30" label="Abdeckungsluecke" dashed />}
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-3 h-3 rounded ${coverageMode === 'isochrone' ? 'bg-blue-500/20 border border-blue-500/40' : 'bg-blue-500/20 border border-blue-500/40 rounded-full'}`} style={coverageMode === 'isochrone' ? { borderRadius: '2px' } : {}} />
              <span className="text-xs text-zinc-400">{coverageMode === 'isochrone' ? 'Isochrone (Fahrgebiet)' : 'Radius (Kreis)'}</span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-zinc-800 px-2 py-2">
          <p className="text-xs text-zinc-500 font-medium px-2 py-1.5">Faelle ({filteredFaelle.length})</p>
          {filteredFaelle.map(f => (
            <button key={f.id} onClick={() => { setSelectedFall(f); setSelectedSV(null) }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group">
              <span className="text-blue-400 text-xs font-mono group-hover:text-blue-300">{f.fallNummer}</span>
              <span className="text-zinc-500 text-xs block truncate">{f.schadensOrt ?? f.adresse}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 relative">
        {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80"><div className="text-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-zinc-400 text-sm">Adressen werden geladen...</p></div></div>}
        <APIProvider apiKey={apiKey} onLoad={handleApiLoad} libraries={['places']}>
          <Map defaultCenter={DEFAULT_CENTER} defaultZoom={DEFAULT_ZOOM} mapId="claimondo-dark" styles={DARK_STYLES} gestureHandling="greedy" disableDefaultUI={false} className="w-full h-full">
            {orgConnections.map((c, i) => <OrgLine key={`o${i}`} from={c.from} to={c.to} />)}
            {showGaps && uncoveredFaelle.length > 0 && <CoverageGapOverlay uncoveredFaelle={uncoveredFaelle} />}
            {filteredSVs.map(sv => <SVMarker key={sv.id} sv={sv} isSelected={selectedSV?.id === sv.id} onSelect={() => { setSelectedSV(sv); setSelectedFall(null) }} coverageMode={coverageMode} />)}
            {filteredFaelle.map(f => {
              const unc = uncoveredFaelle.some(u => u.id === f.id)
              return <AdvancedMarker key={f.id} position={{ lat: f.lat, lng: f.lng }} onClick={() => { setSelectedFall(f); setSelectedSV(null) }}>
                <div className={`w-4 h-4 rounded-full border-2 border-white shadow-lg cursor-pointer transition-transform ${selectedFall?.id === f.id ? 'scale-150' : ''} ${unc ? 'bg-orange-500' : 'bg-red-500'}`} />
              </AdvancedMarker>
            })}
            {/* SV InfoWindow removed — using Profil-Panel instead */}
            {selectedFall && <InfoWindow position={{ lat: selectedFall.lat, lng: selectedFall.lng }} onCloseClick={() => setSelectedFall(null)} pixelOffset={[0, -20]}>
              <div className="p-1 min-w-[200px]">
                <h3 className="font-semibold text-sm text-zinc-900 font-mono mb-1">{selectedFall.fallNummer}</h3>
                <div className="space-y-1 text-xs text-zinc-600">
                  <p><b>Status:</b> {STATUS_LABEL[selectedFall.status] ?? selectedFall.status}</p>
                  <p><b>Kunde:</b> {selectedFall.kunde}</p>
                  {uncoveredFaelle.some(u => u.id === selectedFall.id) && <p className="text-orange-600 font-medium">Keine SV-Abdeckung!</p>}
                </div>
                <Link href={`/admin/faelle/${selectedFall.id}`} className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium">Fall →</Link>
              </div>
            </InfoWindow>}
          </Map>
        </APIProvider>
      </div>

      {/* Gutachter Onboarding Slide-Over */}
      <GutachterSlideOver open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* SV Profil-Panel (Slide-Over) */}
      {selectedSV && (
        <div className="fixed top-0 right-0 h-screen w-80 z-50 bg-zinc-900 border-l border-zinc-800 shadow-2xl overflow-y-auto">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Gutachter-Profil</h2>
              <button onClick={() => setSelectedSV(null)} className="text-zinc-500 hover:text-white transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name + Typ */}
              <div>
                <p className="text-white text-lg font-medium">{selectedSV.name}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${TYP_COLORS[selectedSV.gutachterTyp]?.marker ?? 'bg-blue-500'} text-white`}>
                  {TYP_COLORS[selectedSV.gutachterTyp]?.label ?? selectedSV.gutachterTyp}
                </span>
              </div>

              {/* Standort */}
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Standort</p>
                <p className="text-sm text-zinc-300">{selectedSV.standortAdresse ?? '—'}</p>
              </div>

              {/* Paket + Radius */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Paket</p>
                  <p className="text-sm text-zinc-300">{PAKET_COLORS[selectedSV.paket]?.label ?? selectedSV.paket}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Radius</p>
                  <p className="text-sm text-zinc-300">{selectedSV.radiusKm} km</p>
                </div>
              </div>

              {/* Auslastung */}
              <div>
                <p className="text-xs text-zinc-500 mb-1">Auslastung</p>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-zinc-300 tabular-nums">{selectedSV.offeneFaelle}/{selectedSV.maxFaelleMonat}</span>
                  <span className="text-zinc-600 text-xs">{selectedSV.maxFaelleMonat > 0 ? Math.round((selectedSV.offeneFaelle / selectedSV.maxFaelleMonat) * 100) : 0}%</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(100, selectedSV.maxFaelleMonat > 0 ? (selectedSV.offeneFaelle / selectedSV.maxFaelleMonat) * 100 : 0)}%` }}
                  />
                </div>
              </div>

              {/* Guthaben */}
              {selectedSV.guthaben !== undefined && (
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Guthaben</p>
                  <p className="text-sm text-zinc-300">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(selectedSV.guthaben)}</p>
                </div>
              )}

              {/* Qualifikationen */}
              {selectedSV.qualifikationen && selectedSV.qualifikationen.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Qualifikationen</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedSV.qualifikationen.map(q => (
                      <span key={q} className="bg-zinc-800 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded">{q}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Kontakt */}
              <div>
                <p className="text-xs text-zinc-500 mb-1">Kontakt</p>
                <div className="space-y-1.5">
                  {selectedSV.email && (
                    <a href={`mailto:${selectedSV.email}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                      {selectedSV.email}
                    </a>
                  )}
                  {selectedSV.telefon && (
                    <a href={`tel:${selectedSV.telefon}`} className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300">
                      {selectedSV.telefon}
                    </a>
                  )}
                </div>
              </div>

              {/* Anzahlung */}
              {selectedSV.anzahlungStatus && (
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Anzahlung</p>
                  <span className={`text-xs font-medium ${
                    selectedSV.anzahlungStatus === 'bezahlt' ? 'text-green-400' :
                    selectedSV.anzahlungStatus === 'teilweise' ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {selectedSV.anzahlungStatus === 'bezahlt' ? 'Bezahlt' : selectedSV.anzahlungStatus === 'teilweise' ? 'Teilweise' : 'Offen'}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-zinc-800">
                <Link
                  href={`/admin/sachverstaendige/${selectedSV.id}`}
                  className="flex-1 text-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded-xl transition-colors"
                >
                  Profil bearbeiten
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legende */}
      <div className="absolute bottom-4 left-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-xl p-3 text-[10px] z-10" style={{ pointerEvents: 'auto' }}>
        <p className="text-zinc-400 font-semibold mb-1.5">Legende</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-zinc-400">KFZ-SV</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500" /><span className="text-zinc-400">DAT-SV</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-zinc-400">Akademie</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500" /><span className="text-zinc-400">Buero</span></div>
        </div>
        <div className="border-t border-zinc-800 mt-1.5 pt-1.5 space-y-1">
          <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-blue-500/40 rounded" /><span className="text-zinc-500">Starter 20km</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-green-500/40 rounded" /><span className="text-zinc-500">Standard 40km</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-yellow-500/40 rounded" /><span className="text-zinc-500">Premium 100km</span></div>
        </div>
      </div>
    </div>
  )
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return <div><label className="text-xs text-zinc-500 font-medium block mb-1.5">{label}</label><select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-700 appearance-none">{options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
}

function Leg({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${color}`} /><span className="text-xs text-zinc-400">{label}</span></div>
}

function LegPatterned({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-sm ${color}`} style={dashed ? { border: '1px dashed rgba(239,68,68,0.5)' } : {}} />
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  )
}

function SVMarker({ sv, isSelected, onSelect, coverageMode }: { sv: GeocodedSV; isSelected: boolean; onSelect: () => void; coverageMode: 'isochrone' | 'circle' }) {
  const pc = TYP_COLORS[sv.gutachterTyp] ?? DEFAULT_TYP_COLOR
  const full = sv.maxFaelleMonat > 0 && sv.offeneFaelle >= sv.maxFaelleMonat
  const fillOpacity = full ? 0.1 : 0.2

  return <>
    {coverageMode === 'isochrone' ? (
      <IsochronePolygon center={{ lat: sv.lat, lng: sv.lng }} radiusKm={sv.radiusKm} color={pc.fill} opacity={fillOpacity} />
    ) : (
      <RadiusCircle center={{ lat: sv.lat, lng: sv.lng }} radiusKm={sv.radiusKm} color={pc.fill} opacity={fillOpacity} />
    )}
    <AdvancedMarker position={{ lat: sv.lat, lng: sv.lng }} onClick={onSelect}>
      <div className="relative flex items-center justify-center">
        <div className={`w-5 h-5 rounded-full border-2 border-white shadow-lg cursor-pointer transition-transform ${isSelected ? 'scale-150' : ''} ${full ? 'opacity-50' : ''} ${pc.marker}`} />
        <span className="absolute -bottom-5 text-[10px] font-medium text-white bg-zinc-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">{sv.name.split(' ')[0]}</span>
      </div>
    </AdvancedMarker>
  </>
}
