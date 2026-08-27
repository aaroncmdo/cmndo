'use client'

// AAR-386: Fokus-Modus-Fallakte im arrived-State.
// Ersetzt die RouteSidebar sobald der SV angekommen ist. Zeigt kompakte
// Kopfzeile (Kunde, Kennzeichen, Fahrzeug), das Briefing (read-only) und den
// Besichtigung-abschliessen-Button.
// 2026-07-17: Vor-Ort-Erfassung (Pflichtdokumente-Upload via KameraModal +
// Vor-Ort-Notizen) vorerst entfernt (Aaron "erstmal raus"). Reaktivierung =
// PR-Revert (dieser PR); FeldmodusDokumentSlot + KameraModal wurden als dadurch
// verwaiste Files mitgeloescht und kommen per Revert zurueck.
// Realtime-Subscription auf claims/claim_recency haelt Fall-Info + Briefing
// ohne manuellen Reload aktuell.

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  Loader2Icon,
  PhoneIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react'
import { createClient, whenRealtimeAuthReady } from '@/lib/supabase/client'
import {
  loadFeldmodusFallakteData,
  type FeldmodusFallakteFall,
} from './_fallakte/actions'
import { useOnlineStatus } from '@/lib/offline/use-online-status'
import { saveSnapshot, readSnapshot } from '@/lib/offline/snapshot'
import BesichtigungAbschliessenButton from './BesichtigungAbschliessenButton'

export interface SvFallakteViewProps {
  fallId: string
  sessionId: string
  terminId: string
  onAdvanced: (nextTerminId: string | null) => void
  onPauseBackToRoute: () => void
  /** 2026-05-07: Zurück zur Anfahrt — exit aus arrived ohne Pause/Logout. */
  onBackToRoute?: () => void
}

export default function SvFallakteView({
  fallId,
  sessionId,
  terminId,
  onAdvanced,
  onPauseBackToRoute,
  onBackToRoute,
}: SvFallakteViewProps) {
  const [loading, setLoading] = useState(true)
  const [fall, setFall] = useState<FeldmodusFallakteFall | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const online = useOnlineStatus()
  const snapKey = `feldmodus-fallakte:${fallId}`
  const [staleSince, setStaleSince] = useState<number | null>(null)

  const supabase = useMemo(() => createClient(), [])
  // 2026-05-07: useId-Suffix verhindert „cannot add postgres_changes
  // callbacks after subscribe()"-Crash bei Strict-Mode-Doppel-Mount.
  // Channel-Namen müssen pro Consumer-Instanz eindeutig sein. Siehe
  // Memory feedback_realtime_channel_ids.
  const channelSuffix = useId()

  const reload = useCallback(async () => {
    // Offline branch: read from local snapshot instead of network
    if (!navigator.onLine) {
      const snap = await readSnapshot(snapKey)
      if (snap) {
        const d = snap.data as { fall: FeldmodusFallakteFall }
        setFall(d.fall)
        setStaleSince(snap.saved_at)
      }
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    const res = await loadFeldmodusFallakteData(fallId)
    if (res.success) {
      setFall(res.fall)
      setStaleSince(null)
      void saveSnapshot({ key: snapKey, scope: 'feldmodus', role: 'sv', data: { fall: res.fall } })
    } else {
      setLoadError(res.error)
    }
    setLoading(false)
  }, [fallId, snapKey])

  // Reload on mount, on fall change, AND on connectivity change: when the SV
  // comes back online after a dead zone, re-fetch fresh data + clear the
  // "Offline - Stand X" strip (reload() internally reads navigator.onLine).
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallId, online])

  // Realtime-Subscription auf claims/claim_recency für diesen Fall: wenn Dispatch
  // z. B. das Briefing anpasst, refresht die Fall-Info ohne manuellen Reload.
  // CMM-65: Der faelle-Leg ist auf claims (SSoT) migriert — die Fall-Touch-
  // Writer schreiben jetzt claims.updated_at. claimId kommt aus dem geladenen
  // fall-State; der Effect re-subscribed einmalig sobald er verfuegbar ist.
  const fallClaimId = fall?.claim_id ?? null
  useEffect(() => {
    // Offline: do not open Realtime channels (no network, channels will fail)
    if (!online) return
    // Ohne Claim-Bezug gibt es keinen Live-Refresh-Kanal.
    if (!fallClaimId) return
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    // Erst auf den Realtime-Auth-Token warten (setAuth ist async in client.ts),
    // DANN joinen — sonst joint der claims-Leg als `anon` (Race) und walrus wirft
    // `permission denied`. Siehe whenRealtimeAuthReady() in client.ts.
    void whenRealtimeAuthReady().then(() => {
      if (cancelled) return

      const ch = supabase
        .channel(`feldmodus-fallakte-${fallId}-${channelSuffix}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'claims',
            filter: `id=eq.${fallClaimId}`,
          },
          () => {
            void reload()
          },
        )
        // CMM-66: claim_recency-Leg (leak-freie Recency-SSoT, SV-lesbar). Der
        // claims-Leg darueber ist fuer den SV RLS-tot (CMM-60 Phase 4) — dieser
        // Leg liefert dem SV im Feldmodus den Live-Refresh. Additiv.
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'claim_recency',
            filter: `claim_id=eq.${fallClaimId}`,
          },
          () => {
            void reload()
          },
        )
      ch.subscribe()
      channel = ch
    })

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [supabase, fallId, channelSuffix, reload, fallClaimId, online])

  return (
    <div className="h-full flex flex-col bg-[var(--brand-primary)]/95 backdrop-blur-md text-white">
      {/* Header — 2026-05-07 Aaron-Smoke: drei klare Buttons.
            ×       (Schließen, Zurück zur Anfahrt) — wenn onBackToRoute prop
            ←       Pausieren (zurück zu /heute, Session bleibt)
            ↻       Neu laden */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        {onBackToRoute && (
          <button
            type="button"
            onClick={onBackToRoute}
            className="p-1.5 rounded-ios-lg hover:bg-white/10 text-white/80"
            aria-label="Zurück zur Anfahrt-Karte"
            title="Zurück zur Anfahrt-Karte"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onPauseBackToRoute}
          className="p-1.5 rounded-ios-lg hover:bg-white/10 text-white/80"
          aria-label="Pausieren — zurück zu Heute"
          title="Tagesmodus pausieren"
        >
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/60">
            Vor Ort · Besichtigung
          </p>
          <p className="text-sm font-semibold text-white truncate">
            {fall ? fall.kunde_name : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="p-1.5 rounded-ios-lg hover:bg-white/10 text-white/70 disabled:opacity-50"
          aria-label="Neu laden"
        >
          <RefreshCwIcon
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {staleSince != null && (
          <div className="text-body-xs text-warning-strong bg-warning-soft px-3 py-1.5 rounded-ios-md">
            Offline — Stand {new Date(staleSince).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {loadError ? (
          <div className="p-4 text-xs text-danger bg-danger-soft/30 m-4 rounded-ios-lg">
            {loadError}
          </div>
        ) : loading && !fall ? (
          <div className="p-6 flex items-center justify-center text-white/60 text-xs gap-2">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            Lade Fallakte…
          </div>
        ) : fall ? (
          <div className="p-4 space-y-4">
            {/* Fall-Card */}
            <div className="bg-white rounded-2xl p-4 text-[var(--brand-primary)] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
                    Fall #{fall.claim_nummer}
                  </p>
                  {fall.kennzeichen && (
                    <p className="text-sm font-semibold text-[var(--brand-primary)]">
                      {fall.kennzeichen}
                    </p>
                  )}
                </div>
                {fall.kunde_telefon && (
                  <a
                    href={`tel:${fall.kunde_telefon}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-secondary)] hover:text-[var(--brand-primary)]"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    {fall.kunde_telefon}
                  </a>
                )}
              </div>
              {fall.fahrzeug && (
                <p className="text-xs text-claimondo-navy">{fall.fahrzeug}</p>
              )}
              {fall.szenario && (
                <p className="text-[11px] text-claimondo-ondo">
                  Szenario: {fall.szenario}
                </p>
              )}
              {fall.besichtigungsort_adresse && (
                <p className="text-[11px] text-claimondo-ondo border-t border-claimondo-border pt-2">
                  {fall.besichtigungsort_adresse}
                </p>
              )}
            </div>

            {/* Briefing (read-only, wenn vorhanden) */}
            {fall.sv_briefing_text && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1">
                  Briefing
                </p>
                <p className="text-xs text-white/85 whitespace-pre-wrap">
                  {fall.sv_briefing_text}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Sticky Footer mit Abschluss-Button.
          2026-07-17: pflichtOffen fest 0 — die Pflichtdokument-Erfassung ist
          vorerst raus, also kein Abschluss-Gate mehr. */}
      <div className="px-4 py-3 border-t border-white/10 bg-[var(--brand-primary)]">
        <BesichtigungAbschliessenButton
          sessionId={sessionId}
          terminId={terminId}
          pflichtOffen={0}
          onAdvanced={onAdvanced}
        />
      </div>
    </div>
  )
}
