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
  // useId-Suffix verhindert Strict-Mode-Doppel-Mount-Crash (Memory
  // feedback_realtime_channel_ids).
  const feldmodusTerminChannelSuffix = useId()
  useEffect(() => {
    const terminId = aktuellerStop?.termin_id
    if (!terminId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`feldmodus-termin-${terminId}-${feldmodusTerminChannelSuffix}`)
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
  }, [aktuellerStop?.termin_id, feldmodusTerminChannelSuffix])

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
    // 2026-05-07: Echtes Full-Bleed-Layout. Map ist Bühne unter ALLEM (auch
    // auf Desktop), Sidebar wird zur schwebenden Glass-Card. Vorher war die
    // Sidebar auf Desktop eine 400px-Spalte die der Map die Hälfte vom
    // Viewport gefressen hat — der Premium-Feel kam nicht durch.
    //
    // Glass-Pattern (siehe AAR-769 GlassPanel + Heute-Sidebar): bg-white/65
    // + backdrop-blur-md + border-white/40 + shadow-ios-lg. Map bleibt
    // 100vw × 100vh, Overlays schweben über ihr.
    // 2026-05-07 Fix: h-full cascadet nicht durch von FeldmodusLayout
    // (fixed inset-0). Debug-Skript zeigte: mapboxgl-map.height = 0 → Map
    // rendert nicht. h-screen (100vh) macht die Höhe explizit, dadurch
    // greift h-full im Map-Wrapper darunter.
    <div className="relative h-screen w-screen">
      <OfflineStatusBanner />

      {/* Karte als Background-Layer — full-bleed, absolut positioniert
          unter allen Overlays. */}
      <div className="absolute inset-0 z-0">
        <FeldmodusMap
          sv={sv}
          stops={stops}
          aktuellerStopIndex={aktuellerStopIndex}
          svPosition={position}
          followSv={tbtActive && !!tbt.route}
        />
      </div>

      {/* Desktop (lg+): keine Sidebar mehr — die einzelnen Bedien-Elemente
          schweben als individuelle Glass-Cards über der Map.
          Layout:
            top-left   FokusHeader-Pill (Exit + Stop-Counter + Status)
            mid-left   AktuellerStopCard / SvFallakteView (Hauptinteraktion)
            bottom-left  Stops-Liste collapsed (kommend + erledigt)
          TbtBanner top-center (rendert weiter unten in eigenem Block).
          GPS-/Wake-Lock-Banner bleiben rechts. */}
      {sessionStatus === 'arrived' && aktuellerStop ? (
        // Arrived: Fallakte als Hauptpanel — ab md floating-card via shared
        // GlassPanel (Heute-Pattern), Mobile <md weiter als full-screen
        // Bottom-Sheet-Branch unten.
        <GlassPanel
          variant="prominent"
          className="hidden md:flex md:absolute md:left-4 md:top-4 md:bottom-4 md:w-[420px] md:flex-col md:overflow-hidden z-30"
        >
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
        </GlassPanel>
      ) : (
        <>
          {/* Floating Header-Pill — top-left, kompakt (ab md sichtbar) */}
          <GlassPanel className="hidden md:block absolute top-4 left-4 z-30 overflow-hidden">
            <FokusHeader
              sessionId={session.id}
              sessionStatus={sessionStatus}
              aktuellerIndex={aktuellerStopIndex}
              totalStops={stops.length}
              distanceMeters={distanceMeters}
              variant="light"
            />
          </GlassPanel>

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

      {/* Banner-Overlays — z-20 schweben über der Map.
          Desktop: oben rechts neben den Floating-Cards links (lg:right-4),
          links bleibt frei für FokusHeader/AktuellerStopCard.
          Mobile: oben über der Karte. */}
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
      {error && permissionState !== 'denied' && (
        <div className="absolute top-4 right-4 left-4 md:left-auto md:max-w-sm rounded-xl bg-amber-500/85 backdrop-blur-md border border-white/30 text-white text-xs px-3 py-2 z-20 shadow-ios-md">
          GPS-Warnung: {error}
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
