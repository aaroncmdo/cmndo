'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps'
import { SearchIcon, XIcon } from 'lucide-react'
import Link from 'next/link'

// ---------- Types ----------

interface SV {
  id: string
  name: string
  email: string
  gebietPlz: string[]
  radiusKm: number
  paket: string
  offeneFaelle: number
  maxFaelleMonat: number
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

interface GeocodedSV extends SV {
  lat: number
  lng: number
}

interface GeocodedFall extends Fall {
  lat: number
  lng: number
}

// ---------- Constants ----------

const STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV Termin',
  'gutachten-eingegangen': 'Gutachten eingeg.',
  filmcheck: 'Filmcheck',
  'kanzlei-uebergeben': 'Kanzlei übergeben',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
}

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

const PAKET_LABEL: Record<string, string> = {
  'starter-10': 'Starter',
  'standard-25': 'Standard',
  'premium-50': 'Premium',
}

const DARK_MAP_ID = 'claimondo-dark'

// Dark-mode style for maps without a Cloud Map ID
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
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
]

// Germany center
const DEFAULT_CENTER = { lat: 51.1657, lng: 10.4515 }
const DEFAULT_ZOOM = 6

// ---------- Geocoding cache ----------

const geocodeCache: Record<string, { lat: number; lng: number } | null> = {}

async function geocodeAddress(
  geocoder: google.maps.Geocoder,
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (address in geocodeCache) return geocodeCache[address]
  try {
    const result = await geocoder.geocode({ address: address + ', Deutschland' })
    if (result.results.length > 0) {
      const loc = result.results[0].geometry.location
      const coords = { lat: loc.lat(), lng: loc.lng() }
      geocodeCache[address] = coords
      return coords
    }
  } catch {
    // geocode failed
  }
  geocodeCache[address] = null
  return null
}

// ---------- Radius circle component ----------

function RadiusCircle({
  center,
  radiusKm,
}: {
  center: { lat: number; lng: number }
  radiusKm: number
}) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const circle = new google.maps.Circle({
      map,
      center,
      radius: radiusKm * 1000,
      fillColor: '#3b82f6',
      fillOpacity: 0.08,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.3,
      strokeWeight: 1,
    })
    return () => circle.setMap(null)
  }, [map, center, radiusKm])

  return null
}

// ---------- Main component ----------

export default function KarteClient({
  sachverstaendige,
  faelle,
}: {
  sachverstaendige: SV[]
  faelle: Fall[]
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

  const [geocodedSVs, setGeocodedSVs] = useState<GeocodedSV[]>([])
  const [geocodedFaelle, setGeocodedFaelle] = useState<GeocodedFall[]>([])
  const [selectedSV, setSelectedSV] = useState<GeocodedSV | null>(null)
  const [selectedFall, setSelectedFall] = useState<GeocodedFall | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('alle')
  const [svFilter, setSvFilter] = useState<string>('alle')
  const [search, setSearch] = useState('')

  // Geocode all addresses once the Maps API is loaded
  const handleApiLoad = useCallback(async () => {
    const geocoder = new google.maps.Geocoder()

    // Geocode SVs by their first PLZ
    const svPromises = sachverstaendige.map(async (sv) => {
      const plz = sv.gebietPlz[0]
      if (!plz) return null
      const coords = await geocodeAddress(geocoder, plz)
      if (!coords) return null
      return { ...sv, ...coords } as GeocodedSV
    })

    // Geocode cases by their damage address
    const fallPromises = faelle.map(async (fall) => {
      const addr = fall.adresse || fall.schadensPLZ || fall.schadensOrt
      if (!addr) return null
      const coords = await geocodeAddress(geocoder, addr)
      if (!coords) return null
      return { ...fall, ...coords } as GeocodedFall
    })

    const [svResults, fallResults] = await Promise.all([
      Promise.all(svPromises),
      Promise.all(fallPromises),
    ])

    setGeocodedSVs(svResults.filter((s): s is GeocodedSV => s !== null))
    setGeocodedFaelle(fallResults.filter((f): f is GeocodedFall => f !== null))
    setLoading(false)
  }, [sachverstaendige, faelle])

  // Get unique statuses for filter
  const statuses = useMemo(
    () => [...new Set(faelle.map((f) => f.status))],
    [faelle]
  )

  // Apply filters
  const filteredFaelle = useMemo(() => {
    return geocodedFaelle.filter((f) => {
      if (statusFilter !== 'alle' && f.status !== statusFilter) return false
      if (svFilter !== 'alle' && f.svId !== svFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const match =
          f.fallNummer.toLowerCase().includes(q) ||
          f.kunde.toLowerCase().includes(q) ||
          (f.schadensOrt ?? '').toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [geocodedFaelle, statusFilter, svFilter, search])

  const filteredSVs = useMemo(() => {
    if (svFilter === 'alle') return geocodedSVs
    return geocodedSVs.filter((sv) => sv.id === svFilter)
  }, [geocodedSVs, svFilter])

  if (!apiKey) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center max-w-md">
          <p className="text-white font-medium mb-2">Google Maps API Key fehlt</p>
          <p className="text-zinc-500 text-sm">
            Bitte setze <code className="text-blue-400">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in{' '}
            <code className="text-blue-400">.env.local</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-lg font-semibold text-white">Karte</h1>
          <p className="text-zinc-500 text-xs mt-0.5">
            {sachverstaendige.length} SV &middot; {faelle.length} offene Fälle
          </p>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche..."
              className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 space-y-3 pb-4">
          <div>
            <label className="text-xs text-zinc-500 font-medium block mb-1.5">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-700 appearance-none"
            >
              <option value="alle">Alle Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-500 font-medium block mb-1.5">
              Sachverständiger
            </label>
            <select
              value={svFilter}
              onChange={(e) => setSvFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white focus:outline-none focus:border-zinc-700 appearance-none"
            >
              <option value="alle">Alle SV</option>
              {sachverstaendige.map((sv) => (
                <option key={sv.id} value={sv.id}>
                  {sv.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 font-medium mb-2">Legende</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-zinc-400">Sachverständiger (+ 40km Radius)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-zinc-400">Offener Fall</span>
            </div>
          </div>
        </div>

        {/* Quick list */}
        <div className="flex-1 overflow-y-auto border-t border-zinc-800 px-2 py-2">
          <p className="text-xs text-zinc-500 font-medium px-2 py-1.5">
            Fälle ({filteredFaelle.length})
          </p>
          {filteredFaelle.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setSelectedFall(f)
                setSelectedSV(null)
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group"
            >
              <span className="text-blue-400 text-xs font-mono group-hover:text-blue-300">
                {f.fallNummer}
              </span>
              <span className="text-zinc-500 text-xs block truncate">
                {f.schadensOrt ?? f.adresse}
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">Adressen werden geladen...</p>
            </div>
          </div>
        )}

        <APIProvider
          apiKey={apiKey}
          onLoad={handleApiLoad}
        >
          <Map
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={DEFAULT_ZOOM}
            mapId={DARK_MAP_ID}
            styles={DARK_STYLES}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {/* SV Markers with radius */}
            {filteredSVs.map((sv) => (
              <SVMarkerWithRadius
                key={sv.id}
                sv={sv}
                isSelected={selectedSV?.id === sv.id}
                onSelect={() => {
                  setSelectedSV(sv)
                  setSelectedFall(null)
                }}
              />
            ))}

            {/* Fall Markers */}
            {filteredFaelle.map((fall) => (
              <AdvancedMarker
                key={fall.id}
                position={{ lat: fall.lat, lng: fall.lng }}
                onClick={() => {
                  setSelectedFall(fall)
                  setSelectedSV(null)
                }}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 border-white shadow-lg cursor-pointer transition-transform ${
                    selectedFall?.id === fall.id ? 'bg-red-400 scale-150' : 'bg-red-500'
                  }`}
                />
              </AdvancedMarker>
            ))}

            {/* SV Info Window */}
            {selectedSV && (
              <InfoWindow
                position={{ lat: selectedSV.lat, lng: selectedSV.lng }}
                onCloseClick={() => setSelectedSV(null)}
                pixelOffset={[0, -20]}
              >
                <div className="p-1 min-w-[200px]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-zinc-900">
                      {selectedSV.name}
                    </h3>
                    <button
                      onClick={() => setSelectedSV(null)}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-600">
                    <p>
                      <span className="font-medium">Paket:</span>{' '}
                      {PAKET_LABEL[selectedSV.paket] ?? selectedSV.paket}
                    </p>
                    <p>
                      <span className="font-medium">Offene Fälle:</span>{' '}
                      {selectedSV.offeneFaelle} / {selectedSV.maxFaelleMonat}
                    </p>
                    <p>
                      <span className="font-medium">Auslastung:</span>{' '}
                      {selectedSV.maxFaelleMonat > 0
                        ? `${Math.round(
                            (selectedSV.offeneFaelle / selectedSV.maxFaelleMonat) * 100
                          )}%`
                        : '—'}
                    </p>
                  </div>
                  <Link
                    href={`/admin/sachverstaendige/${selectedSV.id}`}
                    className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Profil ansehen &rarr;
                  </Link>
                </div>
              </InfoWindow>
            )}

            {/* Fall Info Window */}
            {selectedFall && (
              <InfoWindow
                position={{ lat: selectedFall.lat, lng: selectedFall.lng }}
                onCloseClick={() => setSelectedFall(null)}
                pixelOffset={[0, -20]}
              >
                <div className="p-1 min-w-[200px]">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm text-zinc-900 font-mono">
                      {selectedFall.fallNummer}
                    </h3>
                    <button
                      onClick={() => setSelectedFall(null)}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-600">
                    <p>
                      <span className="font-medium">Status:</span>{' '}
                      {STATUS_LABEL[selectedFall.status] ?? selectedFall.status}
                    </p>
                    <p>
                      <span className="font-medium">Schadensart:</span>{' '}
                      {URSACHE_LABEL[selectedFall.schadensUrsache ?? ''] ?? '—'}
                    </p>
                    <p>
                      <span className="font-medium">Kunde:</span>{' '}
                      {selectedFall.kunde}
                    </p>
                    <p className="text-zinc-500">{selectedFall.adresse}</p>
                  </div>
                  <Link
                    href={`/admin/faelle/${selectedFall.id}`}
                    className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Fall ansehen &rarr;
                  </Link>
                </div>
              </InfoWindow>
            )}
          </Map>
        </APIProvider>
      </div>
    </div>
  )
}

// ---------- SV Marker + Radius sub-component ----------

function SVMarkerWithRadius({
  sv,
  isSelected,
  onSelect,
}: {
  sv: GeocodedSV
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <>
      <RadiusCircle center={{ lat: sv.lat, lng: sv.lng }} radiusKm={sv.radiusKm} />
      <AdvancedMarker
        position={{ lat: sv.lat, lng: sv.lng }}
        onClick={onSelect}
      >
        <div className="relative flex items-center justify-center">
          <div
            className={`w-5 h-5 rounded-full border-2 border-white shadow-lg cursor-pointer transition-transform ${
              isSelected ? 'bg-blue-400 scale-150' : 'bg-blue-500'
            }`}
          />
          <span className="absolute -bottom-5 text-[10px] font-medium text-white bg-zinc-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">
            {sv.name.split(' ')[0]}
          </span>
        </div>
      </AdvancedMarker>
    </>
  )
}
