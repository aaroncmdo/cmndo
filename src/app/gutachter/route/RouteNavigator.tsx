'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps'
import {
  NavigationIcon, PhoneIcon, CameraIcon, FileTextIcon, XIcon,
  CheckCircle2Icon, SkipForwardIcon, ChevronUpIcon, ChevronDownIcon,
  MapPinIcon, ClockIcon, AlertTriangleIcon, SendIcon, HashIcon, CalculatorIcon,
} from 'lucide-react'
import { markAnkunft, skipStop, completeBesichtigung, uploadFotoVorOrt } from './actions'

export type Stop = {
  id: string
  fallNummer: string
  name: string
  address: string
  time: string
  lat: number
  lng: number
  ursache: string
  telefon: string | null
  kennzeichen: string | null
  fahrzeug: string | null
  vorschaden: boolean
}

type StopStatus = 'pending' | 'active' | 'done' | 'skipped'

const SKIP_REASONS = ['Kunde nicht da', 'Termin verschoben', 'Falscher Standort', 'Sonstiges']

const MAP_ID = 'route-navigator-map'

// ─── Main ───────────────────────────────────────────────────────────────────

export default function RouteNavigator({ stops, apiKey }: { stops: Stop[]; apiKey: string }) {
  const router = useRouter()
  const [statuses, setStatuses] = useState<StopStatus[]>(stops.map(() => 'pending'))
  const [activeIdx, setActiveIdx] = useState(0)
  const [inspecting, setInspecting] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [showSkipDialog, setShowSkipDialog] = useState(false)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [notizen, setNotizen] = useState('')
  const [saving, setSaving] = useState(false)
  const [routeFinished, setRouteFinished] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Mark first stop as active
  useEffect(() => {
    setStatuses(prev => { const n = [...prev]; n[0] = 'active'; return n })
  }, [])

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return
    const wid = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(wid)
  }, [])

  const [geocoded, setGeocoded] = useState<Record<string, { lat: number; lng: number }>>({})
  const [nearbyAlert, setNearbyAlert] = useState<string | null>(null)
  const [fin, setFin] = useState('')
  const [schaetzung, setSchaetzung] = useState('')
  const dirRendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  const currentStop = stops[activeIdx]
  const doneCount = statuses.filter(s => s === 'done').length
  const skippedCount = statuses.filter(s => s === 'skipped').length

  // Geocode stop addresses to get real coordinates
  useEffect(() => {
    if (typeof google === 'undefined' || stops.length === 0) return
    const geocoder = new google.maps.Geocoder()
    const results: Record<string, { lat: number; lng: number }> = {}
    let cancelled = false
    ;(async () => {
      for (const stop of stops) {
        if (cancelled || !stop.address) continue
        try {
          const res = await geocoder.geocode({ address: stop.address })
          if (res.results[0]) {
            results[stop.id] = {
              lat: res.results[0].geometry.location.lat(),
              lng: res.results[0].geometry.location.lng(),
            }
          }
        } catch { /* skip */ }
      }
      if (!cancelled) setGeocoded(results)
    })()
    return () => { cancelled = true }
  }, [stops])

  // Geofencing: detect arrival within 200m
  useEffect(() => {
    if (!position || !currentStop || statuses[activeIdx] !== 'active') return
    const stopPos = geocoded[currentStop.id] ?? { lat: currentStop.lat, lng: currentStop.lng }
    const dist = haversineDistance(position.lat, position.lng, stopPos.lat, stopPos.lng)
    if (dist < 200) {
      setNearbyAlert(currentStop.name)
    } else {
      setNearbyAlert(null)
    }
  }, [position, currentStop, geocoded, activeIdx, statuses])

  function advanceToNext() {
    const nextIdx = statuses.findIndex((s, i) => i > activeIdx && s === 'pending')
    if (nextIdx === -1) {
      setRouteFinished(true)
    } else {
      setStatuses(prev => { const n = [...prev]; n[nextIdx] = 'active'; return n })
      setActiveIdx(nextIdx)
    }
    setInspecting(false)
    setPhotos([])
    setNotizen('')
    setPanelExpanded(false)
  }

  async function handleArrive() {
    setSaving(true)
    try {
      await markAnkunft(currentStop.id, position?.lat ?? 0, position?.lng ?? 0)
      setStatuses(prev => { const n = [...prev]; n[activeIdx] = 'done'; return n })
      setInspecting(true)
      setPanelExpanded(true)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  async function handleSkip(grund: string) {
    setSaving(true)
    try {
      await skipStop(currentStop.id, grund)
      setStatuses(prev => { const n = [...prev]; n[activeIdx] = 'skipped'; return n })
      setShowSkipDialog(false)
      advanceToNext()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  async function handleComplete() {
    setSaving(true)
    try {
      await completeBesichtigung(currentStop.id, notizen)
      advanceToNext()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      const url = await uploadFotoVorOrt(currentStop.id, fd)
      setPhotos(prev => [...prev, url])
    } catch { /* ignore */ }
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleEnd() {
    router.push('/gutachter/route')
    router.refresh()
  }

  // ─── Route Finished Screen ────────────────────────────────────────────
  if (routeFinished) {
    return (
      <div className="fixed inset-0 z-50 bg-[#080c18] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <CheckCircle2Icon className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Route beendet</h2>
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Besichtigungen</span><span className="text-gray-900 font-semibold">{doneCount}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Übersprungen</span><span className="text-amber-400 font-semibold">{skippedCount}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Fotos hochgeladen</span><span className="text-gray-900 font-semibold">{photos.length}</span></div>
          </div>
          <button onClick={handleEnd} className="w-full py-3.5 bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold rounded-2xl transition-colors">
            Zurück zum Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <APIProvider apiKey={apiKey}>
      <div className="fixed inset-0 z-50 flex flex-col bg-[#080c18]">
        {/* Progress bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-[#080c18]/90 backdrop-blur-sm border-b border-white/5">
          <button onClick={handleEnd} className="p-1.5 text-gray-500 hover:text-gray-800"><XIcon className="w-5 h-5" /></button>
          <div className="flex-1 flex items-center gap-1 px-2">
            {stops.map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${
                  statuses[i] === 'done' ? 'bg-green-500 border-green-500' :
                  statuses[i] === 'skipped' ? 'bg-red-500 border-red-500' :
                  statuses[i] === 'active' ? 'bg-[#4573A2] border-[#4573A2] shadow-[0_0_8px_rgba(59,130,246,0.6)]' :
                  'bg-gray-100 border-gray-300'
                }`} />
                {i < stops.length - 1 && <div className={`flex-1 h-0.5 ${statuses[i] === 'done' || statuses[i] === 'skipped' ? 'bg-green-500/40' : 'bg-gray-100'}`} />}
              </div>
            ))}
          </div>
          <span className="text-gray-500 text-xs tabular-nums shrink-0">{doneCount}/{stops.length}</span>
        </div>

        {/* Map area */}
        <div className={`flex-1 relative transition-all duration-300 ${inspecting ? 'h-[30%]' : panelExpanded ? 'h-[40%]' : 'h-[65%]'}`}>
          <Map
            mapId={MAP_ID}
            defaultCenter={currentStop ? { lat: currentStop.lat, lng: currentStop.lng } : { lat: 50.9375, lng: 6.9603 }}
            defaultZoom={13}
            gestureHandling="greedy"
            disableDefaultUI
            colorScheme="DARK"
            style={{ width: '100%', height: '100%' }}
          >
            {/* Stop markers */}
            {stops.map((stop, i) => {
              const pos = geocoded[stop.id] ?? { lat: stop.lat, lng: stop.lng }
              return (
              <Marker
                key={stop.id}
                position={pos}
                label={{
                  text: `${i + 1}`,
                  color: '#fff',
                  fontWeight: 'bold',
                  fontSize: '12px',
                }}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                  fillColor: statuses[i] === 'done' ? '#22c55e' : statuses[i] === 'skipped' ? '#ef4444' : statuses[i] === 'active' ? '#3b82f6' : '#52525b',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                  scale: 1.5,
                  anchor: { x: 12, y: 24 } as google.maps.Point,
                  labelOrigin: { x: 12, y: 10 } as google.maps.Point,
                }}
              />
              )
            })}
            {/* User position */}
            {position && (
              <Marker
                position={position}
                icon={{
                  path: google.maps.SymbolPath?.CIRCLE ?? 0,
                  fillColor: '#3b82f6',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 3,
                  scale: 8,
                }}
              />
            )}
            <MapController center={currentStop ? (geocoded[currentStop.id] ?? { lat: currentStop.lat, lng: currentStop.lng }) : null} />
            <DirectionsRoute stops={stops} statuses={statuses} activeIdx={activeIdx} geocoded={geocoded} rendererRef={dirRendererRef} />
          </Map>

          {/* Nearby alert */}
          {nearbyAlert && !inspecting && (
            <div className="absolute top-4 left-4 right-4 bg-green-600/90 backdrop-blur-sm text-gray-900 text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-pulse">
              <MapPinIcon className="w-5 h-5" />
              Sie sind angekommen bei {nearbyAlert}
            </div>
          )}

          {/* Navigation button overlay */}
          {currentStop && !inspecting && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(currentStop.address)}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2.5 bg-[#1E3A5F] text-white text-sm font-medium rounded-xl shadow-lg"
            >
              <NavigationIcon className="w-4 h-4" />
              Navigation
            </a>
          )}
        </div>

        {/* Bottom panel */}
        <div className={`bg-[#0d1225] border-t border-white/5 rounded-t-3xl transition-all duration-300 overflow-y-auto ${
          inspecting ? 'flex-[7]' : panelExpanded ? 'flex-[6]' : 'flex-[3.5]'
        }`}>
          {/* Drag handle */}
          <div className="flex justify-center py-2 cursor-pointer" onClick={() => setPanelExpanded(!panelExpanded)}>
            <div className="w-10 h-1 bg-zinc-700 rounded-full" />
          </div>

          <div className="px-4 pb-6">
            {/* Skip Dialog */}
            {showSkipDialog && (
              <div className="mb-4 bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-gray-900 font-medium text-sm mb-3">Grund für Überspringen?</p>
                <div className="space-y-2">
                  {SKIP_REASONS.map(r => (
                    <button key={r} onClick={() => handleSkip(r)} disabled={saving}
                      className="w-full text-left px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm rounded-xl transition-colors disabled:opacity-40">{r}</button>
                  ))}
                </div>
                <button onClick={() => setShowSkipDialog(false)} className="w-full mt-2 text-gray-500 text-sm py-2">Abbrechen</button>
              </div>
            )}

            {inspecting ? (
              /* ─── Besichtigungs-Modus ─── */
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2Icon className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-gray-900 font-semibold">{currentStop.name}</p>
                    <p className="text-gray-500 text-xs">{currentStop.fallNummer} · {currentStop.fahrzeug ?? ''} {currentStop.kennzeichen ?? ''}</p>
                  </div>
                </div>

                {currentStop.vorschaden && (
                  <div className="bg-red-50/50 border border-red-800/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                    <AlertTriangleIcon className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-red-300 text-sm font-medium">Vorschaden bekannt!</p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center gap-2 py-4 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors min-h-[56px]">
                    <CameraIcon className="w-6 h-6 text-[#7BA3CC]" />
                    <span className="text-gray-700 text-xs font-medium">Foto aufnehmen</span>
                  </button>
                  <button onClick={() => {}}
                    className="flex flex-col items-center gap-2 py-4 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors min-h-[56px]">
                    <FileTextIcon className="w-6 h-6 text-violet-400" />
                    <span className="text-gray-700 text-xs font-medium">Dokument scannen</span>
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />

                {/* Photos grid */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {photos.map((url, i) => (
                      <div key={i} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {/* FIN + Schaetzung */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block flex items-center gap-1"><HashIcon className="w-3 h-3" />FIN (17 Zeichen)</label>
                    <input value={fin} onChange={e => setFin(e.target.value.toUpperCase())} maxLength={17} placeholder="WBA..." className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
                    {fin.length > 0 && fin.length !== 17 && <span className="text-red-400 text-xs mt-0.5 block">{fin.length}/17</span>}
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block flex items-center gap-1"><CalculatorIcon className="w-3 h-3" />Schaetzung EUR</label>
                    <input value={schaetzung} onChange={e => setSchaetzung(e.target.value)} type="number" step="100" placeholder="z.B. 3500" className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
                  </div>
                </div>

                {/* Notes */}
                <textarea
                  value={notizen}
                  onChange={e => setNotizen(e.target.value)}
                  placeholder="Notizen vor Ort..."
                  rows={2}
                  className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 mb-4 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
                />

                <button onClick={handleComplete} disabled={saving}
                  className="w-full py-3.5 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-2xl transition-colors disabled:opacity-40 min-h-[56px]">
                  {saving ? 'Speichert...' : 'Besichtigung abschließen'}
                </button>
              </div>
            ) : currentStop ? (
              /* ─── Stop Details ─── */
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-[#4573A2]/20 rounded-full flex items-center justify-center">
                    <span className="text-[#7BA3CC] font-bold">{activeIdx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold truncate">{currentStop.name}</p>
                    <p className="text-gray-500 text-xs">{currentStop.time} · {currentStop.fallNummer}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 mb-1 text-sm">
                  <MapPinIcon className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <span className="text-gray-500">{currentStop.address}</span>
                </div>
                {currentStop.ursache && (
                  <div className="flex items-center gap-2 mb-3 text-sm">
                    <span className="text-gray-500 text-xs">Schaden:</span>
                    <span className="text-gray-700 text-xs">{currentStop.ursache}</span>
                    {currentStop.fahrzeug && <span className="text-gray-500 text-xs">· {currentStop.fahrzeug}</span>}
                  </div>
                )}

                {panelExpanded && (
                  <div className="mb-4 bg-white/50 rounded-xl p-3 space-y-1.5">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Alle Stops</p>
                    {stops.map((s, i) => (
                      <div key={s.id} className={`flex items-center gap-2 py-1.5 text-sm ${i === activeIdx ? 'text-gray-900' : 'text-gray-500'}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          statuses[i] === 'done' ? 'bg-green-500 text-gray-900' :
                          statuses[i] === 'skipped' ? 'bg-red-500 text-gray-900' :
                          statuses[i] === 'active' ? 'bg-[#4573A2] text-gray-900' :
                          'bg-zinc-700 text-gray-500'
                        }`}>{i + 1}</div>
                        <span className="truncate">{s.name}</span>
                        <span className="text-gray-400 text-xs ml-auto shrink-0">{s.time}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2">
                  <button onClick={handleArrive} disabled={saving}
                    className="w-full py-3.5 bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold rounded-2xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2 min-h-[56px]">
                    <CheckCircle2Icon className="w-5 h-5" />
                    {saving ? 'Speichert...' : 'Angekommen'}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowSkipDialog(true)}
                      className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px] text-sm">
                      <SkipForwardIcon className="w-4 h-4" /> Überspringen
                    </button>
                    {currentStop.telefon && (
                      <a href={`tel:${currentStop.telefon}`}
                        className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[48px] text-sm">
                        <PhoneIcon className="w-4 h-4" /> Anrufen
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </APIProvider>
  )
}

// ─── Map auto-center controller ─────────────────────────────────────────────

function MapController({ center }: { center: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (map && center) {
      map.panTo(center)
    }
  }, [map, center?.lat, center?.lng])
  return null
}

// ─── Directions Route Renderer ──────────────────────────────────────────────

function DirectionsRoute({ stops, statuses, activeIdx, geocoded, rendererRef }: {
  stops: Stop[]
  statuses: StopStatus[]
  activeIdx: number
  geocoded: Record<string, { lat: number; lng: number }>
  rendererRef: React.MutableRefObject<google.maps.DirectionsRenderer | null>
}) {
  const map = useMap()

  useEffect(() => {
    if (!map || Object.keys(geocoded).length < 2) return

    const pending = stops.filter((s, i) => i >= activeIdx && (statuses[i] === 'active' || statuses[i] === 'pending'))
    const positions = pending.map(s => geocoded[s.id]).filter(Boolean)
    if (positions.length < 2) {
      if (rendererRef.current) rendererRef.current.setMap(null)
      return
    }

    const directionsService = new google.maps.DirectionsService()
    if (!rendererRef.current) {
      rendererRef.current = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 4, strokeOpacity: 0.7 },
      })
    }
    rendererRef.current.setMap(map)

    const origin = positions[0]
    const destination = positions[positions.length - 1]
    const waypoints = positions.slice(1, -1).map(p => ({
      location: new google.maps.LatLng(p.lat, p.lng),
      stopover: true,
    }))

    directionsService.route({
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      waypoints,
      travelMode: google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK' && result && rendererRef.current) {
        rendererRef.current.setDirections(result)
      }
    })
  }, [map, geocoded, stops, statuses, activeIdx, rendererRef])

  return null
}

// ─── Haversine Distance (meters) ────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
