'use client'

// AAR-387: Fullscreen-Live-Ansicht mit Mapbox-Vogelperspektive.
// Wrappt KundeLiveMap und legt Realtime-Subscriptions auf sv_live_position
// und kunde_live_position drauf. Zeigt ETA-Footer für beide Parteien.
//
// Opt-In via „🗺 Live-Ansicht öffnen"-Button im KundeTrackingClient, oder
// per `?live=1`-URL-Param (Deep-Link aus WhatsApp/Push-Benachrichtigung).

import { useEffect, useMemo, useState } from 'react'
import { XIcon, MapPinIcon, CarIcon, UserIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { haversineKm } from '@/lib/gps/geofence'
import KundeLiveMap from './_kunde-live-map/KundeLiveMap'

interface Position {
  lat: number
  lng: number
}

interface Props {
  onClose: () => void
  svId: string
  svVorname: string
  svAvatarUrl: string | null
  terminId: string
  terminLat: number
  terminLng: number
  terminAdresse: string
  channelHash: string
  /** Erst-Position des SV aus dem Parent (schon via Realtime aktualisiert). */
  initialSvPosition: Position | null
}

export default function LiveAnsichtOverlay({
  onClose,
  svId,
  svVorname,
  svAvatarUrl,
  terminId,
  terminLat,
  terminLng,
  terminAdresse,
  channelHash,
  initialSvPosition,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [svPosition, setSvPosition] = useState<Position | null>(initialSvPosition)
  const [kundePosition, setKundePosition] = useState<Position | null>(null)

  // SV-Live-Position: Realtime + Initial-Load
  useEffect(() => {
    void supabase
      .from('sv_live_position')
      .select('lat, lng')
      .eq('sv_id', svId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSvPosition({ lat: Number(data.lat), lng: Number(data.lng) })
      })

    const channel = supabase
      .channel(`kunde-live-sv-${channelHash}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sv_live_position',
          filter: `sv_id=eq.${svId}`,
        },
        (payload) => {
          const row = payload.new as { lat: string; lng: string }
          setSvPosition({ lat: Number(row.lat), lng: Number(row.lng) })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, svId, channelHash])

  // Kunde-Live-Position: AAR-384 speichert auf termin_id — wir lesen hier nur
  // (schreibt der useKundeLivePosition-Hook woanders).
  useEffect(() => {
    void supabase
      .from('kunde_live_position')
      .select('lat, lng')
      .eq('termin_id', terminId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setKundePosition({ lat: Number(data.lat), lng: Number(data.lng) })
      })

    const channel = supabase
      .channel(`kunde-live-kunde-${channelHash}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kunde_live_position',
          filter: `termin_id=eq.${terminId}`,
        },
        (payload) => {
          const row = payload.new as { lat: string | null; lng: string | null }
          if (row?.lat && row?.lng) {
            setKundePosition({ lat: Number(row.lat), lng: Number(row.lng) })
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, terminId, channelHash])

  // Client-seitige ETA-Schätzung (einfacher haversine · 25 km/h Stadtmittel).
  const svEta = useMemo(() => {
    if (!svPosition) return null
    const km = haversineKm(svPosition.lat, svPosition.lng, terminLat, terminLng)
    return Math.max(1, Math.round((km / 25) * 60))
  }, [svPosition, terminLat, terminLng])

  const kundeEta = useMemo(() => {
    if (!kundePosition) return null
    const km = haversineKm(kundePosition.lat, kundePosition.lng, terminLat, terminLng)
    return Math.max(1, Math.round((km / 25) * 60))
  }, [kundePosition, terminLat, terminLng])

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-claimondo-border bg-[#0D1B3E] text-white flex-shrink-0">
        <MapPinIcon className="w-5 h-5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Live-Ansicht</p>
          <p className="text-[11px] text-white/70 truncate">{terminAdresse}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Live-Ansicht schließen"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Karte */}
      <div className="flex-1 min-h-0 relative">
        <KundeLiveMap
          zielLat={terminLat}
          zielLng={terminLng}
          zielLabel={terminAdresse}
          svPosition={svPosition}
          svVorname={svVorname}
          svAvatarUrl={svAvatarUrl}
          kundePosition={kundePosition}
          className="w-full h-full"
        />
      </div>

      {/* ETA-Footer — zweispaltig wenn beide Positionen vorhanden */}
      <div className="flex-shrink-0 border-t border-claimondo-border bg-white px-4 py-3 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[#4573A2]/10 flex items-center justify-center flex-shrink-0">
            <CarIcon className="w-4 h-4 text-[#4573A2]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
              {svVorname}
            </p>
            <p className="text-sm font-semibold text-[#0D1B3E]">
              {svEta != null ? `ETA ${svEta} Min` : 'Position wartet…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
              Sie
            </p>
            <p className="text-sm font-semibold text-[#0D1B3E]">
              {kundeEta != null
                ? `ETA ${kundeEta} Min`
                : kundePosition
                  ? 'am Ort'
                  : 'Tracking aus'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
