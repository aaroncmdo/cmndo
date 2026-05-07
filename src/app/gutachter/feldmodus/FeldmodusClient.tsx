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
import TbtBanner from './TbtBanner'
import { useFieldTracking } from './useFieldTracking'
import { useTurnByTurn } from './useTurnByTurn'
import { useWakeLock } from '@/hooks/useWakeLock'
import { markArrived, pauseFokusmodus, startStop } from './actions'
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

  // Portal-Review SV1: Screen bleibt an solange der Modus läuft.
  // Wichtig wenn der SV das Telefon im Auto-Halter hat — sonst muss er
  // alle paar Minuten entsperren um auf die Karte zu schauen.
  const wakeLockActive =
    sessionStatus !== 'finished' && sessionStatus !== 'paused'
  const wakeLockStatus = useWakeLock(wakeLockActive)

  // Portal-Review SV1: Mobile-Bottom-Sheet für die Stop-Liste damit die
  // Map auf 390-px-Geräten Full-Bleed bleibt statt halb von der Sidebar
  // geschluckt zu werden. Default expanded damit der SV beim Einstieg in
  // den Modus seine Stops sieht; Toggle via Chevron oben am Sheet.
  // SvFallakteView (sessionStatus='arrived') bleibt full-screen — das
  // ist ein längerer Interaction-Mode, kein Sheet.
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(true)
  const mobileSheetEnabled = sessionStatus !== 'arrived'

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

  // Turn-by-Turn-Navigation: aktiv solange wir unterwegs sind (nicht arrived).
  // Voice ist standardmäßig an, kann via Banner-Button toggled werden.
  const [tbtVoiceOn, setTbtVoiceOn] = useState(true)
  const tbtActive =
    sessionStatus !== 'arrived' &&
    sessionStatus !== 'finished' &&
    !!aktuellerStop?.lat &&
    !!aktuellerStop?.lng
  const tbt = useTurnByTurn({
    origin: tbtActive && position ? { lat: position.lat, lng: position.lng } : null,
    destination:
      tbtActive && aktuellerStop?.lat != null && aktuellerStop?.lng != null
        ? { lat: aktuellerStop.lat, lng: aktuellerStop.lng }
        : null,
    position: position ? { lat: position.lat, lng: position.lng } : null,
    voiceEnabled: tbtVoiceOn,
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
    // 2026-05-06: Feldmodus ist Full-Bleed-Overlay (FeldmodusLayout = fixed
    // inset-0 z-[1200]). Keine negativen Margins nötig — Wrapper ist schon
    // 100vw × 100vh ohne Padding. Layout: Karte oben/rechts, Stop-Liste
    // unten/links, beides bündig zum Viewport-Rand.
    <div className="flex flex-col lg:flex-row h-full w-full">
      <OfflineStatusBanner />

      {/* Sidebar-Spalte
          - Desktop (lg+): linke Spalte 400px, full-height, scrollbar
          - Mobile/Tablet (<lg): Bottom-Sheet als Overlay über der Karte;
            wenn sessionStatus='arrived' deckt die SvFallakteView den
            ganzen Viewport ab (kein Sheet, full-screen Interaction).
          Toggle-Chevron oben am Sheet schaltet zwischen peek (~96 px,
          nur Header sichtbar) und expanded (~70 vh). */}
      <aside
        className={`bg-claimondo-bg lg:order-1 lg:w-[400px] lg:shrink-0 lg:flex lg:flex-col lg:h-full lg:p-4 lg:overflow-y-auto lg:relative lg:inset-auto lg:rounded-none lg:shadow-none ${
          mobileSheetEnabled
            ? // Bottom-Sheet im Driving-/Idle-Modus: peek 96px / expanded 72vh
              `fixed bottom-0 inset-x-0 z-30 px-2 pb-2 pt-1 rounded-t-2xl shadow-ios-lg transition-[max-height] duration-300 ease-out ${
                mobileSheetExpanded ? 'max-h-[72vh]' : 'max-h-[96px]'
              }`
            : // Arrived-Modus: SvFallakteView füllt den ganzen Mobile-Viewport
              'fixed inset-0 z-40 p-2 sm:p-3'
        }`}
      >
        {/* Mobile-Toggle-Chevron — nur im Driving-Modus auf <lg */}
        {mobileSheetEnabled && (
          <button
            type="button"
            onClick={() => setMobileSheetExpanded((v) => !v)}
            aria-label={mobileSheetExpanded ? 'Stops einklappen' : 'Stops aufklappen'}
            className="lg:hidden flex items-center justify-center w-full py-1 text-claimondo-ondo/70 hover:text-claimondo-navy transition-colors"
          >
            <span className="block w-10 h-1 rounded-full bg-claimondo-ondo/30" />
          </button>
        )}
        <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden flex flex-col flex-1 min-h-0">
          {sidebarContent}
        </div>
      </aside>

      {/* Karten-Spalte — rechts auf Desktop, full-bleed Background auf Mobile */}
      <div className="order-1 lg:order-2 relative flex-1 h-full lg:min-h-0">
        <FeldmodusMap
          sv={sv}
          stops={stops}
          aktuellerStopIndex={aktuellerStopIndex}
          svPosition={position}
          followSv={tbtActive && !!tbt.route}
        />
        {tbtActive && tbt.upcomingStep && (
          <TbtBanner
            step={tbt.upcomingStep}
            distanceToManeuverMeters={tbt.distanceToNextManeuver}
            voiceEnabled={tbtVoiceOn}
            onToggleVoice={() => setTbtVoiceOn((v) => !v)}
            totalDurationSec={tbt.route?.duration ?? null}
            totalDistanceMeters={tbt.route?.distance ?? null}
            rerouting={tbt.rerouting}
          />
        )}
        {permissionState === 'denied' && (
          <div className="absolute top-20 left-2 right-2 rounded-md bg-red-600/90 text-white text-xs px-3 py-2 z-10">
            GPS-Zugriff verweigert — Auto-Ankunft und Live-Tracking deaktiviert.
          </div>
        )}
        {error && permissionState !== 'denied' && (
          <div className="absolute top-20 left-2 right-2 rounded-md bg-amber-600/90 text-white text-xs px-3 py-2 z-10">
            GPS-Warnung: {error}
          </div>
        )}
        {/* Portal-Review SV1: Hinweis wenn Wake-Lock NICHT verfügbar ist —
            sonst geht das Display nach Geräte-Default aus, SV muss
            ständig entsperren. „active" wird nicht angezeigt (wenn alles
            funktioniert, kein UI-Klutter). */}
        {(wakeLockStatus === 'unsupported' || wakeLockStatus === 'failed') && (
          <div className="absolute bottom-2 left-2 right-2 sm:left-auto sm:max-w-xs rounded-md bg-claimondo-navy/85 text-white/90 text-[11px] px-3 py-1.5 z-10">
            Hinweis: Display bleibt nicht automatisch an. Geräte-Auto-Sperre
            in den Einstellungen verlängern.
          </div>
        )}
      </div>

      {/* AAR-383: Fokus-Chat als fixes Bottom-Panel — bleibt im normalen
          Wrapper als floating Panel über allem. */}
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
