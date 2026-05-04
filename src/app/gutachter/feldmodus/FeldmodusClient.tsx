'use client'

// AAR-382: Haupt-Orchestrator für den Fokus-Modus.
// Verbindet Mapbox-Karte, Sidebar und Live-Tracking-Hook. Verwaltet den
// aktuellen Stop-Index lokal (initialisiert aus session.aktueller_termin_id),
// reagiert auf Geofence-Events und leitet Fortschritts-Callbacks durch.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { SvTagesSession } from '@/lib/types/field-modus'
import type { FeldmodusStop, FeldmodusSV } from './page'
import FeldmodusMap from './FeldmodusMap'
import RouteSidebar from './RouteSidebar'
import OfflineStatusBanner from './OfflineStatusBanner'
import SvFallakteView from './SvFallakteView'
import FokusChatPanel from './FokusChatPanel'
import MobileBottomSheet from '@/components/sv/MobileBottomSheet'
import { useFieldTracking } from './useFieldTracking'
import { markArrived, pauseFokusmodus, startStop } from './actions'
import { CarIcon, ClockIcon, ChevronUpIcon } from 'lucide-react'
import { formatUhrzeit } from '@/lib/format'
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
  const [svInGeofence, setSvInGeofence] = useState(false)
  const arrivedFiredRef = useRef(false)

  const aktuellerStop = stops[aktuellerStopIndex] ?? null
  const trackingEnabled =
    sv.live_tracking_enabled &&
    sessionStatus !== 'finished' &&
    sessionStatus !== 'paused'

  // Geofence setzt nur Flag — AktuellerStopCard entscheidet wann Akte öffnet
  const onGeofenceReached = useCallback(() => {
    setSvInGeofence(true)
  }, [])

  // Akte öffnen: von AktuellerStopCard gerufen wenn beide am Besichtigungsort
  const onArrived = useCallback(
    async (lat: number, lng: number, via: string) => {
      if (!aktuellerStop) return
      if (arrivedFiredRef.current) return
      arrivedFiredRef.current = true
      const res = await markArrived(
        session.id,
        aktuellerStop.termin_id,
        lat,
        lng,
        via as 'geofence' | 'manuell' | 'termin_uhrzeit',
      )
      if (res.success) {
        toast.success(
          via === 'termin_uhrzeit'
            ? 'Besichtigung gestartet (Terminuhrzeit)'
            : 'Ankunft erkannt — Fallakte wird geöffnet',
        )
        setSessionStatus('arrived')
        router.refresh()
      } else {
        arrivedFiredRef.current = false
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

  // Auto-Losfahren: sobald der SV den Feldmodus für einen aktiven Stop öffnet,
  // markieren wir den Termin als "losgefahren" — generiert Tracking-Token,
  // berechnet ETA und benachrichtigt den Kunden via WhatsApp. Ohne diesen
  // Auto-Trigger sähe der Kunde nichts (kein sv_unterwegs_seit), bis das
  // Geofence-Event im Hintergrund feuert. Idempotent durch losgefahren_am-
  // Check serverseitig + Ref clientseitig.
  const losfahrenFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!aktuellerStop) return
    if (sessionStatus === 'arrived' || sessionStatus === 'finished' || sessionStatus === 'paused') return
    if (aktuellerStop.losgefahren_am) return
    if (losfahrenFiredRef.current === aktuellerStop.termin_id) return
    losfahrenFiredRef.current = aktuellerStop.termin_id
    void startStop(session.id, aktuellerStop.termin_id).catch(() => {
      // Idempotent — wenn der Server sagt "bereits losgefahren", ignorieren wir.
      losfahrenFiredRef.current = null
    })
  }, [aktuellerStop, sessionStatus, session.id])

  // Realtime-Sub auf den aktiven Termin: wenn besichtigung_gestartet_am
  // (z.B. durch Zeit-Fallback auf einem anderen Gerät, oder durch eine
  // andere Tab-Instanz) gesetzt wird, schaltet die UI ohne Reload in den
  // arrived-State und öffnet die Fallakte.
  useEffect(() => {
    const terminId = aktuellerStop?.termin_id
    if (!terminId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`feldmodus-termin-${terminId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gutachter_termine',
          filter: `id=eq.${terminId}`,
        },
        (payload) => {
          const row = payload.new as {
            besichtigung_gestartet_am: string | null
            sv_angekommen_am: string | null
          }
          if (row.besichtigung_gestartet_am || row.sv_angekommen_am) {
            arrivedFiredRef.current = true
            setSessionStatus((prev) => (prev === 'arrived' ? prev : 'arrived'))
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [aktuellerStop?.termin_id])

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
        setSvInGeofence(false)
        arrivedFiredRef.current = false
      }
      router.refresh()
    },
    [stops, router],
  )

  // Sidebar-Inhalt einmal definiert, in Desktop-Sidebar + Mobile-Sheet wiederverwendet
  const sidebarContent =
    sessionStatus === 'arrived' && aktuellerStop ? (
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
        svInGeofence={svInGeofence}
        permissionState={permissionState}
        onAdvanced={onAdvanced}
        onArrived={onArrived}
      />
    )

  return (
    <div className="h-screen w-screen flex flex-col">
      <OfflineStatusBanner />
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      {/* Karte — auf Mobile volle Höhe (Sidebar ist Bottom-Sheet);
          auf Desktop links, Sidebar rechts. */}
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

      {/* Desktop-Sidebar — auf Mobile hidden (Bottom-Sheet ersetzt sie). */}
      <div className="hidden lg:flex flex-none lg:w-[380px] lg:border-l lg:border-white/10 min-h-0 overflow-y-auto">
        {sidebarContent}
      </div>
      </div>

      {/* Mobile-Bottom-Sheet (lg:hidden) — collapsed zeigt Auto + Name +
          Uhrzeit; expanded zeigt die volle Auftrag-Übersicht (Fallakte
          oder RouteSidebar je nach Session-Status). */}
      {aktuellerStop && (
        <MobileBottomSheet
          className="lg:hidden"
          collapsedHeightPx={88}
          expandedRatio={0.85}
          header={
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-full bg-claimondo-navy flex items-center justify-center">
                <CarIcon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 leading-tight">
                  Aktueller Stop
                </p>
                <p className="text-sm font-semibold text-claimondo-navy truncate leading-tight">
                  {aktuellerStop.kunde_name}
                </p>
                <p className="text-[11px] text-claimondo-ondo flex items-center gap-1 leading-tight">
                  <ClockIcon className="w-3 h-3" />
                  {formatUhrzeit(aktuellerStop.start_zeit)}
                  {aktuellerStop.fahrzeug && (
                    <span className="ml-1 truncate">· {aktuellerStop.fahrzeug}</span>
                  )}
                  {aktuellerStop.kennzeichen && (
                    <span className="font-mono ml-1">· {aktuellerStop.kennzeichen}</span>
                  )}
                </p>
              </div>
              <ChevronUpIcon className="w-4 h-4 text-claimondo-ondo/60 shrink-0" />
            </div>
          }
        >
          {sidebarContent}
        </MobileBottomSheet>
      )}

      {/* AAR-383: Fokus-Chat als fixes Bottom-Panel — immer sichtbar
          solange Session aktiv, Auto-Collapse beim arrived-State.
          Auf Mobile sitzt der Chat-Trigger-Button unter dem BottomSheet
          (das z-Index-Stacking handhabt FokusChatPanel über z-40 selbst). */}
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
