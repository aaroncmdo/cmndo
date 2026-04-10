'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { MapPinIcon, PhoneIcon, NavigationIcon, ClockIcon, CarIcon, AlertTriangleIcon, CheckCircleIcon, LocateIcon } from 'lucide-react'
import HeuteMap, { type MapTermin } from '@/components/maps/HeuteMap'
import { useWatchPosition } from '@/lib/gps/use-watch-position'
import { trackPosition } from '@/lib/gps/track-position'
import type { HeuteTermin } from './page'

// KFZ-158 Phase 1: Tagesroute Client-Component.
// Vollbild-Layout: Map oben (60%), Bottom-Sheet mit Termin-Liste unten (40%).

function formatZeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function formatDatum(iso: string): string {
  const d = new Date(iso)
  const heute = new Date()
  if (d.toDateString() === heute.toDateString()) return 'Heute'
  const morgen = new Date(heute)
  morgen.setDate(morgen.getDate() + 1)
  if (d.toDateString() === morgen.toDateString()) return 'Morgen'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function isHeute(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}

// Geocode-Cache: Adresse -> LatLng (simpel via Google Geocoding)
const geoCache = new Map<string, { lat: number; lng: number }>()

export default function HeuteRouteClient({
  termine,
  svLat,
  svLng,
}: {
  termine: HeuteTermin[]
  svLat: number | null
  svLng: number | null
}) {
  const [activeId, setActiveId] = useState<string | null>(termine[0]?.id ?? null)
  const [gpsEnabled, setGpsEnabled] = useState(true)
  const { position: gpsRaw, error: gpsError, permissionState } = useWatchPosition(gpsEnabled)
  const gpsPosition = gpsRaw ? { lat: gpsRaw.lat, lng: gpsRaw.lng } : null
  const lastTrackRef = useRef(0)

  // Throttled GPS-Tracking: alle 30s an Server senden
  useEffect(() => {
    if (!gpsRaw) return
    const now = Date.now()
    if (now - lastTrackRef.current < 30000) return
    lastTrackRef.current = now
    trackPosition({
      lat: gpsRaw.lat,
      lng: gpsRaw.lng,
      accuracy_m: gpsRaw.accuracy,
      heading: gpsRaw.heading,
      speed_mps: gpsRaw.speed,
    }).catch(() => {})
  }, [gpsRaw])

  // Termin-Marker: verwende Adresse als Fallback-Geocoding
  // Da wir kein geocoding API hier aufrufen wollen, nutzen wir die Koeln-Koordinaten
  // als Fallback (die Test-Daten haben keine lat/lng auf Faelle).
  const mapTermine: MapTermin[] = useMemo(() => {
    // PLZ-basierte grobe Koordinaten fuer Koeln (Fallback)
    const PLZ_FALLBACK: Record<string, { lat: number; lng: number }> = {
      '50667': { lat: 50.9375, lng: 6.9603 },
      '50823': { lat: 50.9614, lng: 6.9407 },
      '50677': { lat: 50.9209, lng: 6.9531 },
      '51063': { lat: 50.9709, lng: 7.0029 },
      '50733': { lat: 50.9847, lng: 6.9447 },
      '50670': { lat: 50.9489, lng: 6.9526 },
    }
    return termine.map(t => {
      const plzGeo = t.schadens_plz ? PLZ_FALLBACK[t.schadens_plz] : null
      return {
        id: t.id,
        lat: plzGeo?.lat ?? svLat ?? 50.9375,
        lng: plzGeo?.lng ?? svLng ?? 6.9603,
        label: `${formatZeit(t.start_zeit)} ${t.kunde_name}`,
        adresse: [t.schadens_adresse, t.schadens_plz, t.schadens_ort].filter(Boolean).join(', ') || '—',
      }
    })
  }, [termine, svLat, svLng])

  const activeTermin = termine.find(t => t.id === activeId)

  // Naechster Termin = erster mit start_zeit > now()
  const naechsterTermin = termine.find(t => new Date(t.start_zeit) > new Date()) ?? termine[0]

  if (termine.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center px-8 py-12">
          <MapPinIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Keine Termine heute</h2>
          <p className="text-sm text-gray-500">
            {termine.length === 0 ? 'Genieß den freien Tag!' : ''}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full -mx-4 sm:-mx-6 lg:-mx-8 -my-4">
      {/* GPS Permission Banner */}
      {permissionState === 'denied' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-700 flex items-center gap-2 flex-shrink-0">
          <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          Standort blockiert. Aktiviere ihn in den Browser-Einstellungen für Live-Tracking und optimierte Routenführung.
        </div>
      )}

      {/* Map — 55% */}
      <div className="flex-[55] min-h-0 relative">
        <HeuteMap
          termine={mapTermine}
          myPosition={gpsPosition}
          svLat={svLat}
          svLng={svLng}
          activeTerminId={activeId}
          onTerminClick={setActiveId}
        />

        {/* Floating Action Buttons */}
        {naechsterTermin && (
          <div className="absolute bottom-4 left-4 right-4 flex gap-2 z-10">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                [naechsterTermin.schadens_adresse, naechsterTermin.schadens_plz, naechsterTermin.schadens_ort].filter(Boolean).join(', ')
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white rounded-xl py-3 text-sm font-semibold shadow-lg transition-colors"
            >
              <NavigationIcon className="w-4 h-4" /> Navigation
            </a>
            {naechsterTermin.kunde_telefon && (
              <a
                href={`tel:${naechsterTermin.kunde_telefon}`}
                className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-[#1E3A5F] border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg transition-colors"
              >
                <PhoneIcon className="w-4 h-4" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Bottom Sheet — 45% */}
      <div className="flex-[45] min-h-0 overflow-y-auto bg-white border-t border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-gray-900">
            {termine.filter(t => isHeute(t.start_zeit)).length} Termine heute
            {termine.some(t => !isHeute(t.start_zeit)) && ` + ${termine.filter(t => !isHeute(t.start_zeit)).length} morgen`}
          </h2>
        </div>

        <div className="divide-y divide-gray-100">
          {termine.map((t, i) => {
            const isActive = t.id === activeId
            const isNext = t.id === naechsterTermin?.id
            const adresse = [t.schadens_adresse, t.schadens_plz, t.schadens_ort].filter(Boolean).join(', ')
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  isActive ? 'bg-[#4573A2]/5 border-l-4 border-l-[#4573A2]' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Nummer-Badge */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isNext ? 'bg-[#4573A2] text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatZeit(t.start_zeit)}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {formatDatum(t.start_zeit)}
                      </span>
                      {isNext && (
                        <span className="text-[9px] bg-[#4573A2] text-white px-1.5 py-0.5 rounded-full font-medium">
                          NÄCHSTER
                        </span>
                      )}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        t.status === 'bestaetigt' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {t.status === 'bestaetigt' ? 'Bestätigt' : 'Offen'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 mt-0.5">{t.kunde_name}</p>
                    <p className="text-xs text-gray-500 truncate">{adresse || '—'}</p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                      {t.kennzeichen && <span className="font-mono">{t.kennzeichen}</span>}
                      {t.fahrzeug && <span>{t.fahrzeug}</span>}
                      {t.szenario && <span>{t.szenario.replace(/_/g, ' ')}</span>}
                    </div>
                  </div>

                  {/* Quick-Actions */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-[#4573A2]/10 hover:bg-[#4573A2]/20 text-[#4573A2]"
                      title="Navigation"
                    >
                      <NavigationIcon className="w-3.5 h-3.5" />
                    </a>
                    {t.kunde_telefon && (
                      <a
                        href={`tel:${t.kunde_telefon}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600"
                        title="Anrufen"
                      >
                        <PhoneIcon className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* TODO KFZ-158 Phase 3: 'Ich bin angekommen' Swipe-Button */}
      </div>
    </div>
  )
}
