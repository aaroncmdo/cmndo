'use client'

import { useEffect, useState, useMemo } from 'react'
import { MapPinIcon, ClockIcon, CheckCircleIcon, CarIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import LiveTrackingMap from '@/components/maps/LiveTrackingMap'

// KFZ-179: Kunden-Tracking-Client — Live-Map mit SV-Position + ETA.

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function KundeTrackingClient({
  svId,
  svVorname,
  svNachname,
  terminLat,
  terminLng,
  adresse,
  angekommen,
  losgefahren,
  token,
  notification5minSent,
}: {
  svId: string
  svVorname: string
  svNachname: string
  terminLat: number
  terminLng: number
  adresse: string
  angekommen: boolean
  losgefahren: boolean
  token: string
  notification5minSent: boolean
}) {
  const [svPosition, setSvPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const [isAngekommen, setIsAngekommen] = useState(angekommen)
  const [notified5min, setNotified5min] = useState(notification5minSent)
  const supabase = useMemo(() => createClient(), [])

  // Initial: letzte Position laden + Realtime
  useEffect(() => {
    supabase
      .from('sv_live_position')
      .select('lat, lng')
      .eq('gutachter_id', svId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSvPosition({ lat: Number(data.lat), lng: Number(data.lng) })
      })

    const channel = supabase
      .channel(`kunde-tracking-${svId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sv_live_position',
        filter: `gutachter_id=eq.${svId}`,
      }, (payload) => {
        const row = payload.new as { lat: string; lng: string }
        setSvPosition({ lat: Number(row.lat), lng: Number(row.lng) })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [svId, supabase])

  // ETA berechnen + 5-Min-Notification
  useEffect(() => {
    if (!svPosition) return
    const distKm = haversineKm(svPosition.lat, svPosition.lng, terminLat, terminLng)
    const eta = Math.max(1, Math.round((distKm / 25) * 60)) // 25 km/h Stadtdurchschnitt
    setEtaMinutes(eta)

    if (eta <= 5 && !notified5min) {
      setNotified5min(true)
      fetch('/api/kunde-5min-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {})
    }

    if (distKm < 0.1) setIsAngekommen(true)
  }, [svPosition, terminLat, terminLng, notified5min, token])

  if (isAngekommen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb] px-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#0D1B3E] mb-2">{svVorname} ist da!</h1>
          <p className="text-gray-600">Die Besichtigung kann jetzt beginnen.</p>
        </div>
      </div>
    )
  }

  if (!losgefahren) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fb] px-6">
        <div className="max-w-md text-center">
          <ClockIcon className="w-12 h-12 text-[#4573A2] mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#0D1B3E] mb-2">Termin vorbereitet</h1>
          <p className="text-gray-600">
            {svVorname} wird sich auf den Weg machen. Sie werden benachrichtigt sobald es losgeht.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fb]">
      {/* Header */}
      <div className="bg-[#0D1B3E] text-white px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <CarIcon className="w-6 h-6 text-[#7BA3CC]" />
          <div>
            <h1 className="text-lg font-bold">{svVorname} ist unterwegs</h1>
            <p className="text-sm text-[#7BA3CC]">
              {etaMinutes != null ? `ETA: ca. ${etaMinutes} Minuten` : 'Position wird geladen...'}
            </p>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 min-h-0">
        <LiveTrackingMap
          svPosition={svPosition}
          terminLat={terminLat}
          terminLng={terminLng}
        />
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#4573A2] flex items-center justify-center text-white font-bold text-sm">
            {svVorname[0]}{svNachname?.[0] ?? ''}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#0D1B3E]">{svVorname} {svNachname}</p>
            <p className="text-xs text-gray-500">Ihr KFZ-Sachverständiger</p>
          </div>
          {etaMinutes != null && (
            <div className="text-right">
              <p className="text-lg font-bold text-[#0D1B3E]">{etaMinutes} Min</p>
              <p className="text-[10px] text-gray-400">geschätzte Ankunft</p>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <MapPinIcon className="w-3 h-3" /> {adresse}
        </p>
      </div>
    </div>
  )
}
