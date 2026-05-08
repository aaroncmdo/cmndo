'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NavigationIcon, MapPinIcon, ClockIcon, CheckIcon, AlertCircleIcon } from 'lucide-react'
import { useWatchPosition } from '@/lib/gps/use-watch-position'
import { updateLivePosition, arrived } from '@/lib/termine/actions'
import { haversineMeters } from '@/lib/gps/geofence'

// KFZ-200: Navigation-Modus Client-Component.

interface Props {
  terminId: string
  fallId: string
  adresse: string
  leadName: string
  startZeit: string
  initialEta: number | null
  targetLat: number | null
  targetLng: number | null
}

const UPDATE_INTERVAL_MS = 10_000

export default function NavigationClient({
  terminId,
  fallId,
  adresse,
  leadName,
  startZeit,
  initialEta,
  targetLat,
  targetLng,
}: Props) {
  const router = useRouter()
  const { position, error: gpsError, permissionState } = useWatchPosition(true)
  const [eta, setEta] = useState<number | null>(initialEta)
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
  const [arrived_, setArrived] = useState(false)
  const [manualArriving, setManualArriving] = useState(false)
  const lastUpdateRef = useRef<number>(0)
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

  // Local distance calc with haversine for immediate feedback
  useEffect(() => {
    if (!position || !targetLat || !targetLng) return
    const d = Math.round(haversineMeters(position.lat, position.lng, targetLat, targetLng))
    setDistanceMeters(d)
  }, [position, targetLat, targetLng])

  // Track position every 10s + check arrival
  const doUpdate = useCallback(async (lat: number, lng: number) => {
    const res = await updateLivePosition(terminId, lat, lng)
    if (res.distanceMeters !== undefined) setDistanceMeters(res.distanceMeters)
    if (res.arrived) {
      setArrived(true)
      setTimeout(() => router.push(`/gutachter/termine/${terminId}/vor-ort`), 1500)
    }
  }, [terminId, router])

  useEffect(() => {
    if (!position) return
    const now = Date.now()
    if (now - lastUpdateRef.current < UPDATE_INTERVAL_MS) return
    lastUpdateRef.current = now
    doUpdate(position.lat, position.lng)
  }, [position, doUpdate])

  function handleManualArrived() {
    setManualArriving(true)
    arrived(terminId).then(() => {
      setArrived(true)
      setTimeout(() => router.push(`/gutachter/termine/${terminId}/vor-ort`), 800)
    }).catch(() => setManualArriving(false))
  }

  const uhrzeit = new Date(startZeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
  const datum = new Date(startZeit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' })

  if (arrived_) {
    return (
      <div className="fixed inset-0 bg-emerald-600 flex flex-col items-center justify-center gap-4 z-50">
        <CheckIcon className="w-16 h-16 text-white" />
        <p className="text-2xl font-bold text-white">Angekommen!</p>
        <p className="text-white/80 text-sm">Weiterleitung zum Vor-Ort-Modus...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-claimondo-navy">

      {/* ETA Bar at top */}
      <div className="bg-[var(--brand-primary)] text-white px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Link href={`/gutachter/termine/${terminId}`} className="text-white/70 text-sm hover:text-white">←</Link>
          <div>
            <p className="text-xs text-white/60">{leadName}</p>
            <p className="text-sm font-semibold">{datum} · {uhrzeit}</p>
          </div>
        </div>
        <div className="text-right">
          {eta !== null ? (
            <div className="flex items-center gap-1">
              <ClockIcon className="w-4 h-4 text-[#C9A84C]" />
              <span className="text-lg font-bold">{eta} min</span>
            </div>
          ) : (
            <span className="text-white/50 text-sm">ETA berechne...</span>
          )}
          {distanceMeters !== null && (
            <p className="text-xs text-white/60 mt-0.5">
              {distanceMeters >= 1000
                ? `${(distanceMeters / 1000).toFixed(1)} km`
                : `${distanceMeters} m`} entfernt
            </p>
          )}
        </div>
      </div>

      {/* Map Placeholder / Google Maps Embed */}
      <div className="flex-1 relative">
        {adresse && mapsKey ? (
          <iframe
            title="Karte"
            className="w-full h-full border-0"
            loading="lazy"
            src={`https://www.google.com/maps/embed/v1/directions?key=${mapsKey}&origin=${position ? `${position.lat},${position.lng}` : 'Mein+Standort'}&destination=${encodeURIComponent(adresse)}&mode=driving`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-claimondo-shield gap-4">
            <MapPinIcon className="w-16 h-16 text-claimondo-ondo" />
            <p className="text-claimondo-ondo/70 text-sm text-center px-6">
              {adresse || 'Adresse nicht verfügbar'}
            </p>
            {adresse && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(adresse)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[var(--brand-secondary)] text-white px-4 py-2 rounded-xl text-sm font-medium"
              >
                In Google Maps öffnen
              </a>
            )}
          </div>
        )}

        {/* GPS Permission Warning */}
        {permissionState === 'denied' && (
          <div className="absolute top-2 left-2 right-2 bg-red-900/90 text-white text-xs p-3 rounded-xl flex items-start gap-2">
            <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>GPS-Zugriff verweigert. Bitte in den Einstellungen aktivieren um Live-Tracking zu nutzen.</span>
          </div>
        )}
        {gpsError && permissionState !== 'denied' && (
          <div className="absolute top-2 left-2 right-2 bg-amber-900/90 text-white text-xs p-3 rounded-xl">
            GPS: {gpsError}
          </div>
        )}
      </div>

      {/* Bottom: Manual Arrived Button */}
      <div className="bg-[var(--brand-primary)] px-4 py-4 safe-area-bottom space-y-3">
        {distanceMeters !== null && distanceMeters < 200 && (
          <div className="bg-emerald-900/50 border border-emerald-700 rounded-xl p-3 text-center">
            <p className="text-emerald-300 text-sm font-medium">Du bist fast da! ({distanceMeters} m)</p>
          </div>
        )}
        <button
          onClick={handleManualArrived}
          disabled={manualArriving}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-4 text-base font-bold transition-colors disabled:opacity-50"
        >
          <MapPinIcon className="w-5 h-5" />
          {manualArriving ? 'Speichere...' : 'Ich bin angekommen'}
        </button>
        {adresse && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(adresse)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-white/50 text-xs py-1 hover:text-white/80"
          >
            In Google Maps öffnen →
          </a>
        )}
      </div>

    </div>
  )
}
