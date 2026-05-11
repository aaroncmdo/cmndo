'use client'

// AAR-382: Haupt-Orchestrator für den Fokus-Modus.
// Verbindet Mapbox-Karte, Sidebar und Live-Tracking-Hook. Verwaltet den
// aktuellen Stop-Index lokal (initialisiert aus session.aktueller_termin_id),
// reagiert auf Geofence-Events und leitet Fortschritts-Callbacks durch.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
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
import FokusHeader from './FokusHeader'
import AktuellerStopCard from './AktuellerStopCard'
import StopListItem from './StopListItem'
import GlassPanel from '@/components/shared/GlassPanel'
import NaviHud, { pickHighestPriorityNotice, formatNaviDistance, type NaviNotice } from './NaviHud'
import { useFieldTracking } from './useFieldTracking'
import { useTurnByTurn } from './useTurnByTurn'
import { useWakeLock } from '@/hooks/useWakeLock'
import { markArrived, pauseFokusmodus, startStop, exitArrivedToRoute } from './actions'
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
  const wakeLockActive =
    sessionStatus !== 'finished' && sessionStatus !== 'paused'
  const wakeLockStatus = useWakeLock(wakeLockActive)

  // Portal-Review SV1: Mobile-Bottom-Sheet für die Stop-Liste.
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

  const { position: livePosition, distanceMeters, permissionState, error, staleSinceMs } = useFieldTracking({
    enabled: trackingEnabled,
    svId: sv.id,
    terminId: aktuellerStop?.termin_id ?? null,
    targetLat: aktuellerStop?.lat ?? null,
    targetLng: aktuellerStop?.lng ?? null,
    onGeofenceReached,
  })

  // Position-Fallback: bei GPS-Denied → sv.standort als Anker
  const position = livePosition ?? (
    sv.standort_lat != null && sv.standort_lng != null
      ? { lat: sv.standort_lat, lng: sv.standort_lng, heading: null }
      : null
  )

  // Turn-by-Turn-Navigation
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

  // NaviHud-Notice-Stack
  const [mapNotice, setMapNotice] = useState<NaviNotice | null>(null)
  const naviNotice = useMemo<NaviNotice | null>(() => {
    let laneNotice: NaviNotice | null = null
    let maneuverNotice: NaviNotice | null = null
    if (tbt.upcomingStep && tbt.distanceToNextManeuver != null) {
      const step = tbt.upcomingStep
      const distLabel = formatNaviDistance(tbt.distanceToNextManeuver)
      const lanes = step.bannerInstructions[0]?.lanes
      if (lanes && lanes.length > 1 && tbt.distanceToNextManeuver < 300) {
        laneNotice = {
          type: 'lane',
          lanes,
          maneuverInstruction: step.instruction,
          distanceLabel: distLabel,
        }
      }
      maneuverNotice = {
        type: 'maneuver',
        maneuverType: step.maneuverType,
        modifier: step.maneuverModifier,
        instruction: step.instruction,
        distanceLabel: distLabel,
        streetName: step.name,
      }
    }
    return pickHighestPriorityNotice({
      blitzer: mapNotice?.type === 'blitzer' ? mapNotice : null,
      hazard: mapNotice?.type === 'hazard' ? mapNotice : null,
      reroute: mapNotice?.type === 'reroute' ? mapNotice : null,
      lane: laneNotice,
      maneuver: maneuverNotice,
    })
  }, [mapNotice, tbt.upcomingStep, tbt.distanceToNextManeuver])

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
  // 2026-05-07: Exit aus arrived → idle. Auto-Arrive (Termin-Uhrzeit-
  // Fallback) kann den SV ungewollt in den Vor-Ort-Modus schicken — dieser
  // Handler bringt ihn zurück zur Anfahrt + reset arrivedFiredRef.
  const handleBackToRoute = useCallback(async () => {
    if (!aktuellerStop) return
    const res = await exitArrivedToRoute(session.id, aktuellerStop.termin_id)
    if (res.success) {
      arrivedFiredRef.current = false
      setSessionStatus('idle')
    } else {
      toast.error(res.error ?? 'Konnte nicht zur Anfahrt zurück')
    }
  }, [aktuellerStop, session.id])

  const sidebarContent =
    sessionStatus === 'arrived' && aktuellerStop ? (
      <SvFallakteView
        fallId={aktuellerStop.fall_id}
        sessionId={session.id}
        terminId={aktuellerStop.termin_id}
        onAdvanced={onAdvanced}
        onBackToRoute={handleBackToRoute}
        onPauseBackToRoute={async () => {
          const res = await pauseFokusmodus(session.id)
          if (res.success) {
            setSessionStatus('paused')
            router.push('/gutachter/heute?info=Tagesmodus+pausiert')
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
      {/* Karte — oben auf mobile, links auf desktop */}
      <div className="relative flex-1 min-h-0 lg:flex-1">
        <FeldmodusMap
          sv={sv}
          stops={stops}
          aktuellerStopIndex={aktuellerStopIndex}
          svPosition={position}
          // 2026-05-07 (Aaron-Smoke MAP3): Camera folgt der SV-Position
          // sobald sie verfügbar ist — nicht abhängig von TBT-Route.
          // Vorher musste TBT-Routing erfolgreich laden bevor follow-mode
          // aktiv war; bei kaltem Start ohne GPS sah das wie eine static
          // map aus.
          followSv={!!position}
          // 2026-05-08 (C6): Hero-Pin Arrived-Choreographie
          arrived={sessionStatus === 'arrived'}
          // 2026-05-08 (C10): Map-side Notices (Blitzer/Hazard/Reroute)
          // an den Notice-Stack des Clients
          onMapNotice={setMapNotice}
        />
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
            svInGeofence={svInGeofence}
            permissionState={permissionState}
            onAdvanced={onAdvanced}
            onArrived={onArrived}
          />
        )}
      </div>
      </div>

      {/* Floating-Cards (ab md) — outerer Fragment-Wrapper */}
      {sessionStatus !== 'arrived' && (
        <>
          {/* AktuellerStopCard — mid-left, Hauptinteraktion (ab md) */}
          {aktuellerStop && (
            <GlassPanel
              variant="prominent"
              className="hidden md:block absolute left-4 top-24 w-[380px] z-30 overflow-hidden"
            >
              <AktuellerStopCard
                stop={aktuellerStop}
                sessionId={session.id}
                sessionStatus={sessionStatus}
                svPosition={position ? { lat: position.lat, lng: position.lng } : null}
                svInGeofence={svInGeofence}
                permissionState={permissionState}
                distanceMeters={distanceMeters}
                onAdvanced={onAdvanced}
                onArrived={onArrived}
              />
            </GlassPanel>
          )}

          {/* Kommende Stops — bottom-left als kompakte Liste (ab md) */}
          {stops.length - aktuellerStopIndex - 1 > 0 && (
            <GlassPanel className="hidden md:block absolute left-4 bottom-4 w-[380px] max-h-[280px] z-30 overflow-hidden">
              <div className="px-3 py-2 border-b border-white/40">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-claimondo-ondo">
                  Kommende Stops ({stops.length - aktuellerStopIndex - 1})
                </p>
              </div>
              <div className="overflow-y-auto max-h-[230px] p-2 space-y-1.5">
                {stops.slice(aktuellerStopIndex + 1).map((stop) => (
                  <StopListItem key={stop.termin_id} stop={stop} variant="kommend" />
                ))}
              </div>
            </GlassPanel>
          )}
        </>
      )}

      {/* Mobile (<lg): Bottom-Sheet bleibt — Mobile-UX funktioniert mit
          einem Sheet besser als mit verstreuten Floating-Cards. Sheet ist
          glassy (bg-white/65 + backdrop-blur-md). Im arrived-Modus deckt
          SvFallakteView den ganzen Mobile-Viewport ab. */}
      <aside
        className={`md:hidden z-30 ${
          mobileSheetEnabled
            ? `fixed bottom-0 inset-x-0 px-2 pb-2 pt-1 rounded-t-2xl bg-white/65 backdrop-blur-md border border-white/40 shadow-ios-lg transition-[max-height] duration-300 ease-out ${
                mobileSheetExpanded ? 'max-h-[72vh]' : 'max-h-[96px]'
              }`
            : 'fixed inset-0 z-40 p-2 sm:p-3 bg-white/95 backdrop-blur-md'
        }`}
      >
        {mobileSheetEnabled && (
          <button
            type="button"
            onClick={() => setMobileSheetExpanded((v) => !v)}
            aria-label={mobileSheetExpanded ? 'Stops einklappen' : 'Stops aufklappen'}
            className="flex items-center justify-center w-full py-1 text-claimondo-ondo/70 hover:text-claimondo-navy transition-colors"
          >
            <span className="block w-10 h-1 rounded-full bg-claimondo-ondo/40" />
          </button>
        )}
        <div className="bg-white/85 border border-white/50 rounded-xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-ios-sm">
          {sidebarContent}
        </div>
      </aside>

      {/* 2026-05-08 (C10) NaviHud — bottom-mittig, Glass-Design mit
          Mode-Tönung. Konsolidiert Blitzer/Hazard/Reroute/Lane/Maneuver
          in einen einzigen Slot. Vorher waren TbtBanner (top-rechts) und
          RerouteToast (top-edge) zwei konkurrierende Banner — der SV
          wusste nicht wo er hinschauen sollte. */}
      {tbtActive && <NaviHud notice={naviNotice} />}

      {/* Reduzierter Top-Banner: nur noch Gesamt-ETA + Voice-Toggle.
          Maneuver/Stau-Detail wandert in den NaviHud unten. */}
      {tbtActive && tbt.upcomingStep && (
        <div className="absolute top-4 right-4 left-4 md:left-auto md:max-w-md z-20">
          <TbtBanner
            step={tbt.upcomingStep}
            distanceToManeuverMeters={tbt.distanceToNextManeuver}
            voiceEnabled={tbtVoiceOn}
            onToggleVoice={() => setTbtVoiceOn((v) => !v)}
            totalDurationSec={tbt.route?.duration ?? null}
            totalDistanceMeters={tbt.route?.distance ?? null}
            rerouting={tbt.rerouting}
          />
        </div>
      )}
      {/* GPS-Banner ist Information (Auto-Ankunft deaktiviert), kein
          Critical-Error → Amber statt Red, kompakter (max-w-sm Desktop). */}
      {permissionState === 'denied' && (
        <div className="absolute top-4 right-4 left-4 md:left-auto md:max-w-sm rounded-xl bg-amber-500/85 backdrop-blur-md border border-white/30 text-white text-xs px-3 py-2 z-20 shadow-ios-md">
          GPS-Zugriff verweigert — Auto-Ankunft und Live-Tracking deaktiviert.
        </div>
      )}
      {error && permissionState !== 'denied' && !staleSinceMs && (
        <div className="absolute top-4 right-4 left-4 md:left-auto md:max-w-sm rounded-xl bg-amber-500/85 backdrop-blur-md border border-white/30 text-white text-xs px-3 py-2 z-20 shadow-ios-md">
          GPS-Warnung: {error}
        </div>
      )}
      {/* 2026-05-08 (C13b): Stale-GPS-Banner — letzte Position älter als
          30 s. Statt position auf null zu setzen behalten wir den letzten
          guten Punkt + zeigen das hier deutlich an, damit der SV weiß
          dass die Live-Pos vielleicht überholt ist (Funkloch / Tunnel /
          Tiefgarage). Pre-existing GPS-Warnung wird in dem Fall
          unterdrückt — Stale ist die spezifischere Info. */}
      {staleSinceMs != null && permissionState !== 'denied' && (
        <div className="absolute top-4 right-4 left-4 md:left-auto md:max-w-sm rounded-xl bg-amber-500/85 backdrop-blur-md border border-white/30 text-white text-xs px-3 py-2 z-20 shadow-ios-md">
          GPS unsicher — letzte Position vor{' '}
          {staleSinceMs < 60_000
            ? `${Math.round(staleSinceMs / 1000)} s`
            : `${Math.round(staleSinceMs / 60_000)} min`}
        </div>
      )}
      {/* Wake-Lock-Hinweis: bottom-20 (above Inbox-FAB der bottom-4 right-4
          sitzt) damit nichts überlappt. */}
      {(wakeLockStatus === 'unsupported' || wakeLockStatus === 'failed') && (
        <div className="absolute bottom-20 right-4 sm:max-w-xs rounded-xl bg-claimondo-navy/75 backdrop-blur-md border border-white/20 text-white/90 text-[11px] px-3 py-1.5 z-20 shadow-ios-md">
          Hinweis: Display bleibt nicht automatisch an. Geräte-Auto-Sperre
          in den Einstellungen verlängern.
        </div>
      )}

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
