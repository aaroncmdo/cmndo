'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  MapPinIcon, ClockIcon, NavigationIcon, ExternalLinkIcon,
  PlayIcon, CheckCircle2Icon, SkipForwardIcon, XCircleIcon,
} from 'lucide-react'
import RouteNavigator, { type Stop as NavStop } from './RouteNavigator'

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden', sachbeschaedigung: 'Sachbeschaedigung', brand: 'Brand',
  einbruch: 'Einbruch', sturmschaden: 'Sturmschaden', vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiss', sonstiges: 'Sonstiges',
}
const URSACHE_COLOR: Record<string, string> = {
  wasserschaden: 'bg-blue-950 text-blue-300', sachbeschaedigung: 'bg-orange-950 text-orange-300',
  brand: 'bg-red-950 text-red-300', einbruch: 'bg-purple-950 text-purple-300',
  sturmschaden: 'bg-cyan-950 text-cyan-300', vandalismus: 'bg-pink-950 text-pink-300',
  verschleiss: 'bg-amber-950 text-amber-300', sonstiges: 'bg-zinc-800 text-zinc-300',
}

export type StopData = {
  id: string
  terminId: string | null
  fallNummer: string
  name: string
  telefon: string | null
  address: string
  time: string
  schadenTyp: string | null
  fahrzeug: string | null
  kennzeichen: string | null
  vorschaden: boolean
  status: 'ausstehend' | 'vor-ort' | 'erledigt' | 'uebersprungen'
  ankunftZeit: string | null
  abschlussZeit: string | null
  notizen: string | null
}

const STATUS_ICON: Record<string, typeof CheckCircle2Icon> = {
  erledigt: CheckCircle2Icon,
  uebersprungen: SkipForwardIcon,
  'vor-ort': MapPinIcon,
}
const STATUS_COLOR: Record<string, string> = {
  erledigt: 'text-green-400',
  uebersprungen: 'text-red-400',
  'vor-ort': 'text-blue-400',
  ausstehend: 'text-zinc-600',
}

function estimateDriveMinutes(index: number) {
  return [15, 20, 12, 25, 18, 22, 10, 30][index % 8]
}

export default function RouteClient({
  stops, datum, mapsKey,
}: {
  stops: StopData[]
  datum: string
  mapsKey: string
}) {
  const [navigating, setNavigating] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [navStops, setNavStops] = useState<NavStop[]>([])

  const addresses = stops.map(s => s.address).filter(Boolean)
  const routeUrl = addresses.length > 1
    ? `https://www.google.com/maps/dir/${addresses.map(a => encodeURIComponent(a)).join('/')}`
    : null

  async function startNavigation() {
    if (!mapsKey) return
    setGeocoding(true)
    const pending = stops.filter(s => s.status === 'ausstehend' || s.status === 'vor-ort')
    const geocoded: NavStop[] = []
    for (const s of pending) {
      if (!s.address) continue
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(s.address)}&key=${mapsKey}`)
        const data = await res.json()
        const loc = data.results?.[0]?.geometry?.location
        geocoded.push({
          id: s.id, fallNummer: s.fallNummer, name: s.name, address: s.address, time: s.time,
          lat: loc?.lat ?? 50.9375, lng: loc?.lng ?? 6.9603,
          ursache: s.schadenTyp ? (URSACHE_LABEL[s.schadenTyp] ?? s.schadenTyp) : '',
          telefon: s.telefon, kennzeichen: s.kennzeichen, fahrzeug: s.fahrzeug, vorschaden: s.vorschaden,
        })
      } catch {
        geocoded.push({
          id: s.id, fallNummer: s.fallNummer, name: s.name, address: s.address, time: s.time,
          lat: 50.9375, lng: 6.9603,
          ursache: s.schadenTyp ? (URSACHE_LABEL[s.schadenTyp] ?? s.schadenTyp) : '',
          telefon: s.telefon, kennzeichen: s.kennzeichen, fahrzeug: s.fahrzeug, vorschaden: s.vorschaden,
        })
      }
    }
    setNavStops(geocoded)
    setGeocoding(false)
    if (geocoded.length > 0) setNavigating(true)
  }

  if (navigating && navStops.length > 0 && mapsKey) {
    return <RouteNavigator stops={navStops} apiKey={mapsKey} />
  }

  const doneCount = stops.filter(s => s.status === 'erledigt').length
  const pendingCount = stops.filter(s => s.status === 'ausstehend' || s.status === 'vor-ort').length

  return (
    <div className="px-4 py-8"><div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Tagesroute</h1>
        <p className="text-zinc-500 text-sm mt-0.5">{datum}</p>
      </div>

      {/* Route starten */}
      {stops.length > 0 && pendingCount > 0 && mapsKey && (
        <button
          onClick={startNavigation}
          disabled={geocoding}
          className="flex items-center justify-center gap-3 w-full py-4 mb-4 rounded-2xl font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', boxShadow: '0 4px 20px rgba(59,130,246,0.3)' }}
        >
          <PlayIcon className="w-5 h-5" />
          {geocoding ? 'Lade Karte...' : `Route starten (${pendingCount} Stops)`}
        </button>
      )}

      {/* External maps */}
      {routeUrl && (
        <a href={routeUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-3 px-4 rounded-2xl transition-colors mb-6">
          <ExternalLinkIcon className="w-4 h-4 opacity-60" /> In Google Maps öffnen
        </a>
      )}

      {stops.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
          <MapPinIcon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">Keine Termine heute</p>
          <p className="text-zinc-600 text-sm mt-1">Fuer heute sind keine Vor-Ort-Besichtigungen geplant.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stops.map((stop, index) => {
            const Icon = STATUS_ICON[stop.status]
            return (
              <div key={stop.id}>
                {index > 0 && (
                  <div className="flex items-center justify-center gap-2 py-2 text-zinc-600">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <div className="flex items-center gap-1.5 text-xs"><ClockIcon className="w-3.5 h-3.5" /><span>~{estimateDriveMinutes(index - 1)} Min</span></div>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>
                )}

                <div className={`bg-zinc-900 rounded-2xl border p-4 transition-colors ${
                  stop.status === 'erledigt' ? 'border-green-800/30' :
                  stop.status === 'uebersprungen' ? 'border-red-800/30 opacity-60' :
                  stop.status === 'vor-ort' ? 'border-blue-800/30' :
                  'border-zinc-800'
                }`}>
                  <div className="flex items-start gap-3">
                    {Icon && <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${STATUS_COLOR[stop.status]}`} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-white font-mono text-lg font-semibold tabular-nums">{stop.time}</span>
                        <span className="text-zinc-200 text-sm font-medium truncate">{stop.name}</span>
                      </div>
                      {stop.address && (
                        <div className="flex items-start gap-2 mb-3">
                          <MapPinIcon className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                          <span className="text-zinc-400 text-sm">{stop.address}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {stop.schadenTyp && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${URSACHE_COLOR[stop.schadenTyp] ?? 'bg-zinc-800 text-zinc-300'}`}>
                            {URSACHE_LABEL[stop.schadenTyp] ?? stop.schadenTyp}
                          </span>
                        )}
                        <span className="text-zinc-700 text-xs font-mono">{stop.fallNummer}</span>
                        {stop.status === 'erledigt' && <span className="text-green-500 text-xs">Erledigt</span>}
                        {stop.status === 'uebersprungen' && <span className="text-red-400 text-xs">Übersprungen</span>}
                      </div>
                    </div>
                  </div>
                  {stop.status !== 'uebersprungen' && (
                    <div className="flex gap-2 mt-4">
                      <Link href={`/gutachter/fall/${stop.id}`} className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors">Fallakte</Link>
                      {stop.address && (
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.address)}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors">
                          <NavigationIcon className="w-4 h-4" /><span className="hidden sm:inline">Maps</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {stops.length > 0 && (
        <div className="mt-6 bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Termine heute</span>
            <span className="text-white font-semibold">{stops.length}</span>
          </div>
          {doneCount > 0 && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-zinc-400">Erledigt</span>
              <span className="text-green-400 font-semibold">{doneCount}</span>
            </div>
          )}
        </div>
      )}
    </div></div>
  )
}
