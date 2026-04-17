'use client'

import { useEffect, useState, useMemo } from 'react'
import { MapPinIcon, ClockIcon, CheckCircleIcon, CarIcon, RefreshCwIcon, XCircleIcon, CalendarIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { terminAnnehmen, terminGegenvorschlag } from '@/lib/actions/termin-actions'
import LiveTrackingMap from '@/components/maps/LiveTrackingMap'
import { haversineKm } from '@/lib/gps/geofence'
import Avatar from '@/components/shared/Avatar'
import KundeAnfahrtCard from './KundeAnfahrtCard'

// AAR-423: Brand-aware Primary-Akzente via CSS-Vars mit Claimondo-Fallbacks.
// Surface/Background/Text bleiben Claimondo-Default — nur „Primary"-Elemente
// (Call-to-Action, Avatar-Akzent, Tracking-Header) übernehmen SV-Theme.
const brandPrimary = 'var(--brand-primary, #0D1B3E)'
const brandPrimaryHover = 'var(--brand-primary-hover, #1A2A55)'

export default function KundeTrackingClient({
  svId,
  channelHash,
  svVorname,
  svNachname,
  svAvatarUrl,
  svAnzeigename,
  terminLat,
  terminLng,
  adresse,
  angekommen,
  losgefahren,
  token,
  terminId,
  fallId,
  terminStatus,
  gegenvorschlagVon,
  vorgeschlagenesDatum,
  notification5minSent,
  kundenTrackingAngeboten,
  kundeTrackingAktiviert,
  kundeBereitsAngekommen,
}: {
  svId: string
  channelHash: string
  svVorname: string
  svNachname: string
  svAvatarUrl: string | null
  svAnzeigename: string
  terminLat: number
  terminLng: number
  adresse: string
  angekommen: boolean
  losgefahren: boolean
  token: string
  terminId: string
  fallId: string
  terminStatus: string
  gegenvorschlagVon: string | null
  vorgeschlagenesDatum: string | null
  notification5minSent: boolean
  kundenTrackingAngeboten: boolean
  kundeTrackingAktiviert: boolean
  kundeBereitsAngekommen: boolean
}) {
  const [svPosition, setSvPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null)
  const [isAngekommen, setIsAngekommen] = useState(angekommen)
  const [notified5min, setNotified5min] = useState(notification5minSent)
  const [showGegenvorschlag, setShowGegenvorschlag] = useState(false)
  const [gegenDatum, setGegenDatum] = useState('')
  const [gegenGrund, setGegenGrund] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [actionDone, setActionDone] = useState<string | null>(null)
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

    // BUG-105: Channel-Name gehasht statt svId direkt
    const channel = supabase
      .channel(`kunde-tracking-${channelHash}`)
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
  }, [svId, supabase, channelHash])

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
      <div className="flex-1 flex items-center justify-center px-6 py-10">
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

  // KFZ-134: Gegenvorschlag UI wenn SV einen Termin vorgeschlagen hat
  const isSvVorschlag = (terminStatus === 'vorschlag' || terminStatus === 'reserviert' || (terminStatus === 'gegenvorschlag' && gegenvorschlagVon === 'sv'))

  if (actionDone) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="max-w-md text-center">
          <CheckCircleIcon className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#0D1B3E] mb-2">{actionDone}</h1>
        </div>
      </div>
    )
  }

  if (!losgefahren) {
    const terminDatum = vorgeschlagenesDatum ?? ''
    const terminDisplay = terminDatum ? new Date(terminDatum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''

    return (
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="max-w-md w-full">
          <div className="text-center mb-6">
            <CalendarIcon className="w-12 h-12 mx-auto mb-4" style={{ color: brandPrimary }} />
            <h1 className="text-xl font-bold text-[#0D1B3E] mb-2">
              {isSvVorschlag ? 'Terminvorschlag' : 'Termin vorbereitet'}
            </h1>
            {terminDisplay && <p className="text-sm text-gray-700 font-medium mb-1">{terminDisplay}</p>}
            <p className="text-sm text-gray-500">Sachverständiger: {svAnzeigename || `${svVorname} ${svNachname}`.trim()}</p>
            <p className="text-xs text-gray-400 mt-1">{adresse}</p>
          </div>

          {isSvVorschlag && !showGegenvorschlag && (
            <div className="space-y-2">
              <button
                onClick={async () => {
                  setActionPending(true)
                  await terminAnnehmen({ source: 'kunde', fallId })
                  setActionDone('Termin bestätigt!')
                }}
                disabled={actionPending}
                className="w-full flex items-center justify-center gap-2 text-white rounded-xl py-3 text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: brandPrimary }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = brandPrimaryHover)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = brandPrimary)}
              >
                <CheckCircleIcon className="w-4 h-4" /> Termin annehmen
              </button>
              <button
                onClick={() => setShowGegenvorschlag(true)}
                disabled={actionPending}
                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-amber-700 border border-amber-200 rounded-xl py-3 text-sm font-medium transition-colors"
              >
                <RefreshCwIcon className="w-4 h-4" /> Anderen Termin vorschlagen
              </button>
            </div>
          )}

          {showGegenvorschlag && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Alternativen Termin vorschlagen</h3>
              {/* AAR-452: text-base + min-h-[44px] für iOS-Zoom + Touch-Target */}
              <input type="datetime-local" value={gegenDatum} onChange={e => setGegenDatum(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-base focus:outline-none"
                style={{ outlineColor: brandPrimary }} />
              <textarea value={gegenGrund} onChange={e => setGegenGrund(e.target.value)} placeholder="Begründung (optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base resize-none focus:outline-none"
                style={{ outlineColor: brandPrimary }} rows={2} />
              <div className="flex gap-2">
                <button onClick={() => setShowGegenvorschlag(false)} className="flex-1 min-h-[44px] rounded-xl text-sm bg-gray-100 text-gray-600">Abbrechen</button>
                <button
                  onClick={async () => {
                    if (!gegenDatum) return
                    setActionPending(true)
                    await terminGegenvorschlag({ source: 'kunde', fallId, neuesDatum: gegenDatum, grund: gegenGrund })
                    setActionDone('Gegenvorschlag gesendet!')
                  }}
                  disabled={actionPending || !gegenDatum}
                  className="flex-1 min-h-[44px] rounded-xl text-sm font-semibold bg-amber-500 text-white disabled:opacity-50"
                >
                  Vorschlagen
                </button>
              </div>
            </div>
          )}

          {!isSvVorschlag && (
            <p className="text-center text-gray-500 text-sm">
              {svVorname} wird sich auf den Weg machen. Sie werden benachrichtigt sobald es losgeht.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tracking-Header: Primary-Surface (SV-Primary wenn verifiziert, sonst Claimondo-Navy) */}
      <div
        className="text-white px-5 py-4 flex-shrink-0"
        style={{ backgroundColor: brandPrimary }}
      >
        <div className="flex items-center gap-3">
          <CarIcon className="w-6 h-6 text-white/70" />
          <div>
            <h1 className="text-lg font-bold">{svVorname} ist unterwegs</h1>
            <p className="text-sm text-white/70">
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

      {/* Footer: Avatar-Akzent in SV-Primary */}
      <div className="bg-white border-t border-gray-200 px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {svAvatarUrl ? (
            <Avatar url={svAvatarUrl} name={svAnzeigename || svVorname} size="sm" />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: brandPrimary }}
            >
              {svVorname[0]}{svNachname?.[0] ?? ''}
            </div>
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#0D1B3E]">{svAnzeigename || `${svVorname} ${svNachname}`.trim()}</p>
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

        {/* AAR-384: Anfahrt-Tracking für Kunden — nur wenn Termin nicht
            beim Kunden zuhause ist (z. B. Werkstatt, neutraler Ort). */}
        {kundenTrackingAngeboten && !kundeBereitsAngekommen && (
          <div className="mt-3">
            <KundeAnfahrtCard
              token={token}
              terminId={terminId}
              initiallyAktiviert={kundeTrackingAktiviert}
              terminAdresse={adresse}
            />
          </div>
        )}
      </div>
    </div>
  )
}
