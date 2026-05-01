'use client'

// AAR-382: Haupt-Orchestrator für den Fokus-Modus.
// Verbindet Mapbox-Karte, Sidebar und Live-Tracking-Hook. Verwaltet den
// aktuellen Stop-Index lokal (initialisiert aus session.aktueller_termin_id),
// reagiert auf Geofence-Events und leitet Fortschritts-Callbacks durch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { SvTagesSession } from '@/lib/types/field-modus'
import type { FeldmodusStop, FeldmodusSV } from './page'
import FeldmodusMap from './FeldmodusMap'
import RouteSidebar from './RouteSidebar'
import OfflineStatusBanner from './OfflineStatusBanner'
import SvFallakteView from './SvFallakteView'
import FokusChatPanel from './FokusChatPanel'
import { useFieldTracking } from './useFieldTracking'
import { markArrived, pauseFokusmodus } from './actions'
import { recoverOutbox } from '@/lib/offline/outbox'
import { registerOnlineSync, syncOutbox } from '@/lib/offline/sync-outbox'
import { registerGpsOnlineSync, syncGpsOutbox } from '@/lib/offline/sync-gps-outbox'

export interface FeldmodusClientProps {
  session: SvTagesSession
  sv: FeldmodusSV
  stops: FeldmodusStop[]
  userId: string
}

export default function FeldmodusClient({
  session,
  sv,
  stops,
  userId,
}: FeldmodusClientProps) {
  const router = useRouter()

  const initialIndex = useMemo(() => {
    if (!session.aktueller_termin_id) return 0
    const idx = stops.findIndex(
      (s) => s.termin_id === session.aktueller_termin_id,
    )
    return idx >= 0 ? idx : 0
  }, [session.aktueller_termin_id, stops])

  const [aktuellerStopIndex, setAktuellerStopIndex] = useState(initialIndex)
  const [sessionStatus, setSessionStatus] = useState(session.status)
  const geofenceLockRef = useRef(false)

  const aktuellerStop = stops[aktuellerStopIndex] ?? null
  const trackingEnabled =
    sv.live_tracking_enabled &&
    sessionStatus !== 'finished' &&
    sessionStatus !== 'paused'

  const onGeofenceReached = useCallback(
    async (pos: { lat: number; lng: number }) => {
      if (!aktuellerStop) return
      if (geofenceLockRef.current) return
      geofenceLockRef.current = true
      const res = await markArrived(
        session.id,
        aktuellerStop.termin_id,
        pos.lat,
        pos.lng,
        'geofence',
      )
      if (res.success) {
        toast.success('Ankunft automatisch erkannt (100 m Radius)')
        setSessionStatus('arrived')
        router.refresh()
      } else {
        geofenceLockRef.current = false
        toast.error(res.error ?? 'Auto-Ankunft fehlgeschlagen')
      }
    },
    [aktuellerStop, session.id, router],
  )

  const { position, distanceMeters, permissionState, error } = useFieldTracking({
    enabled: trackingEnabled,
    svId: sv.id,
    terminId: aktuellerStop?.termin_id ?? null,
    targetLat: aktuellerStop?.lat ?? null,
    targetLng: aktuellerStop?.lng ?? null,
    onGeofenceReached,
  })

  // AAR-388: Beim Mount Recovery fahren + Sync-Listeners registrieren.
  // Hängengebliebene 'uploading'-Items aus Tab-Reload zurück auf 'pending'.
  useEffect(() => {
    void recoverOutbox().catch(() => {})
    registerOnlineSync()
    registerGpsOnlineSync()
    // Initial-Sync beim Einstieg (deckt Szenario „App offline gestartet, jetzt online")
    void syncOutbox().catch(() => {})
    void syncGpsOutbox().catch(() => {})
  }, [])

  const onAdvanced = useCallback(
    (nextTerminId: string | null) => {
      if (!nextTerminId) {
        setSessionStatus('finished')
        router.refresh()
        return
      }
      const nextIdx = stops.findIndex((s) => s.termin_id === nextTerminId)
      if (nextIdx >= 0) {
        setAktuellerStopIndex(nextIdx)
        setSessionStatus('idle')
        geofenceLockRef.current = false
      }
      router.refresh()
    },
    [stops, router],
  )

  return (
    <div className="h-screen w-screen flex flex-col">
      <OfflineStatusBanner />
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      {/* Karte — oben auf mobile, links auf desktop */}
      <div className="relative flex-1 min-h-0 lg:flex-1">
        <FeldmodusMap
          sv={sv}
          stops={stops}
          aktuellerStopIndex={aktuellerStopIndex}
          svPosition={position}
        />
        {permissionState === 'denied' && (
          <div className="absolute top-2 left-2 right-2 rounded-md bg-red-600/90 text-white text-xs px-3 py-2">
            GPS-Zugriff verweigert — Auto-Ankunft und Live-Tracking deaktiviert.
          </div>
        )}
        {error && permissionState !== 'denied' && (
          <div className="absolute top-2 left-2 right-2 rounded-md bg-amber-600/90 text-white text-xs px-3 py-2">
            GPS-Warnung: {error}
          </div>
        )}
      </div>

      {/* Sidebar — unten auf mobile, rechts auf desktop.
          AAR-386: Im arrived-State zeigt SvFallakteView statt RouteSidebar. */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:flex-none lg:w-[380px] lg:border-l lg:border-white/10">
        {sessionStatus === 'arrived' && aktuellerStop ? (
          <SvFallakteView
            fallId={aktuellerStop.fall_id}
            sessionId={session.id}
            terminId={aktuellerStop.termin_id}
            onAdvanced={onAdvanced}
            onPauseBackToRoute={async () => {
              const res = await pauseFokusmodus(session.id)
              if (res.success) {
                setSessionStatus('paused')
                router.push('/gutachter/heute?info=Fokus-Modus+pausiert')
              } else {
                toast.error(res.error ?? 'Pausieren fehlgeschlagen')
              }
            }}
          />
        ) : (
          <RouteSidebar
            sessionId={session.id}
            sessionStatus={sessionStatus}
            stops={stops}
            aktuellerStopIndex={aktuellerStopIndex}
            svPosition={position ? { lat: position.lat, lng: position.lng } : null}
            distanceMeters={distanceMeters}
            onAdvanced={onAdvanced}
          />
        )}
      </div>
      </div>

      {/* AAR-383: Fokus-Chat als fixes Bottom-Panel — immer sichtbar
          solange Session aktiv, Auto-Collapse beim arrived-State. */}
      {aktuellerStop && sessionStatus !== 'finished' && (
        <FokusChatPanel
          fallId={aktuellerStop.fall_id}
          sessionStatus={sessionStatus}
          etaMinutes={
            distanceMeters != null
              ? Math.max(0, Math.round((distanceMeters / 1000 / 25) * 60))
              : null
          }
          terminAddress={aktuellerStop.adresse}
          customerName={aktuellerStop.kunde_name}
          currentUserId={userId}
        />
      )}
    </div>
  )
}
