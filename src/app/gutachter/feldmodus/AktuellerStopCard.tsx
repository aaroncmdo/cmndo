'use client'

// AAR-382 / Auto-Arrive: Expanded Card für den aktiven Stop im Fokus-Modus.
// Keine manuellen "Losfahren"/"Ich bin angekommen"-Buttons mehr — Ankunft wird
// automatisch erkannt:
//   1. SV im 100m-Geofence UND (Kunde nicht aktiviert ODER Kunde angekommen)
//   2. Fallback: Terminuhrzeit erreicht und GPS nicht verfügbar
// Beim Auslösen ruft onArrived() — FeldmodusClient setzt sessionStatus='arrived'
// → Fallakte öffnet automatisch.

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  PhoneIcon,
  NavigationIcon,
  CheckCircle2Icon,
  MapPinIcon,
  CarIcon,
  AlertTriangleIcon,
  FileTextIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from 'lucide-react'
import { formatUhrzeit } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import type { FeldmodusStop } from './page'
import type { SessionStatus } from '@/lib/types/field-modus'
import { completeAndAdvance, markSvVorOrt, markBesichtigungGestartet } from './actions'

export interface AktuellerStopCardProps {
  stop: FeldmodusStop
  sessionId: string
  sessionStatus: SessionStatus
  svPosition: { lat: number; lng: number } | null
  svInGeofence: boolean
  permissionState: 'pending' | 'granted' | 'denied'
  distanceMeters: number | null
  onAdvanced: (nextTerminId: string | null) => void
  onArrived: (lat: number, lng: number, via: 'geofence' | 'manuell' | 'termin_uhrzeit') => void
}

// 2026-05-08 (C1) Smart-Collapse Schwellen — siehe Comment in
// AktuellerStopCard für die Begründung der konkreten Werte.
const COMPACT_DISTANCE_THRESHOLD_M = 500

function buildGoogleMapsLink(stop: FeldmodusStop): string {
  const base = 'https://www.google.com/maps/dir/?api=1'
  if (stop.place_id) {
    return `${base}&destination=${encodeURIComponent(stop.adresse)}&destination_place_id=${stop.place_id}`
  }
  if (stop.lat != null && stop.lng != null) {
    return `${base}&destination=${stop.lat},${stop.lng}`
  }
  return `${base}&destination=${encodeURIComponent(stop.adresse)}`
}

function formatDistanceShort(m: number | null): string | null {
  if (m == null) return null
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

export default function AktuellerStopCard({
  stop,
  sessionId,
  sessionStatus,
  svPosition,
  svInGeofence,
  permissionState,
  distanceMeters,
  onAdvanced,
  onArrived,
}: AktuellerStopCardProps) {
  const [pending, startTransition] = useTransition()
  const distanceShort = formatDistanceShort(distanceMeters)
  // 2026-05-08 (C1) Smart-Collapse: bei null oder > 500 m Distanz → Card kompakt
  // (Briefing/Pflichtdoku/Aktionen nehmen sonst 80 % des Viewports beim Fahren).
  // Tap expandiert. manualMode überschreibt die Auto-Heuristik in beide Richtungen.
  const autoCompact = distanceMeters == null || distanceMeters > COMPACT_DISTANCE_THRESHOLD_M
  const [manualMode, setManualMode] = useState<'compact' | 'expanded' | null>(null)
  const isCompact = manualMode != null ? manualMode === 'compact' : autoCompact
  // C1: Briefing default collapsed (200–400-Wörter-Output) — SV öffnet gezielt.
  const [briefingOpen, setBriefingOpen] = useState(false)

  // AAR-384 + Auto-Arrive: Termin-State live beobachten (Kunde-Tracking +
  // sv_angekommen_am + besichtigung_gestartet_am).
  const supabase = useMemo(() => createClient(), [])
  // 2026-05-07: useId-Suffix verhindert „cannot add postgres_changes
  // callbacks after subscribe()"-Crash bei Strict-Mode-Doppel-Mount oder
  // Layout-bedingt parallelem Render. Memory feedback_realtime_channel_ids.
  const channelSuffix = useId()
  const [kundeTracking, setKundeTracking] = useState<{
    aktiviert: boolean
    etaMinutes: number | null
    angekommenAm: string | null
  }>({ aktiviert: false, etaMinutes: null, angekommenAm: null })
  const [svAngekommenAm, setSvAngekommenAm] = useState<string | null>(stop.sv_angekommen_am ?? null)
  const [besichtigungGestartetAm, setBesichtigungGestartetAm] = useState<string | null>(null)
  const svVorOrtFiredRef = useRef(false)
  const besichtigungFiredRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('gutachter_termine')
      .select(
        'kunde_tracking_aktiviert, kunde_eta_minuten, kunde_angekommen_am, sv_angekommen_am, besichtigung_gestartet_am',
      )
      .eq('id', stop.termin_id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setKundeTracking({
          aktiviert: !!data.kunde_tracking_aktiviert,
          etaMinutes: (data.kunde_eta_minuten as number | null) ?? null,
          angekommenAm: (data.kunde_angekommen_am as string | null) ?? null,
        })
        setSvAngekommenAm((data.sv_angekommen_am as string | null) ?? null)
        setBesichtigungGestartetAm((data.besichtigung_gestartet_am as string | null) ?? null)
      })
    const channel = supabase
      .channel(`sv-termin-state-${stop.termin_id}-${channelSuffix}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gutachter_termine',
          filter: `id=eq.${stop.termin_id}`,
        },
        (payload) => {
          const row = payload.new as {
            kunde_tracking_aktiviert: boolean | null
            kunde_eta_minuten: number | null
            kunde_angekommen_am: string | null
            sv_angekommen_am: string | null
            besichtigung_gestartet_am: string | null
          }
          setKundeTracking({
            aktiviert: !!row.kunde_tracking_aktiviert,
            etaMinutes: row.kunde_eta_minuten ?? null,
            angekommenAm: row.kunde_angekommen_am ?? null,
          })
          setSvAngekommenAm(row.sv_angekommen_am ?? null)
          setBesichtigungGestartetAm(row.besichtigung_gestartet_am ?? null)
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [supabase, stop.termin_id, channelSuffix])

  const besichtigungLaeuft = Boolean(besichtigungGestartetAm) || sessionStatus === 'arrived'
  const svIstDa = Boolean(svAngekommenAm)

  // Reset arrived-flags wenn neuer Stop geladen wird
  useEffect(() => {
    svVorOrtFiredRef.current = false
    besichtigungFiredRef.current = false
  }, [stop.termin_id])

  // Phase 1: SV im Geofence → sv_angekommen_am setzen (alleine)
  useEffect(() => {
    if (svIstDa || svVorOrtFiredRef.current) return
    if (!svInGeofence) return
    svVorOrtFiredRef.current = true
    void markSvVorOrt(
      stop.termin_id,
      svPosition?.lat ?? stop.lat ?? 0,
      svPosition?.lng ?? stop.lng ?? 0,
      'geofence',
    ).catch(() => {
      svVorOrtFiredRef.current = false
    })
  }, [svIstDa, svInGeofence, stop.termin_id, svPosition, stop.lat, stop.lng])

  // Phase 2: Beide vor Ort → besichtigung_gestartet_am
  useEffect(() => {
    if (besichtigungLaeuft || besichtigungFiredRef.current) return
    if (!svIstDa) return
    if (kundeTracking.aktiviert && !kundeTracking.angekommenAm) return
    besichtigungFiredRef.current = true
    void markBesichtigungGestartet(sessionId, stop.termin_id, 'beide_angekommen')
      .then((res) => {
        if (res.success) {
          onArrived(
            svPosition?.lat ?? stop.lat ?? 0,
            svPosition?.lng ?? stop.lng ?? 0,
            'geofence',
          )
        } else {
          besichtigungFiredRef.current = false
        }
      })
      .catch(() => {
        besichtigungFiredRef.current = false
      })
  }, [
    besichtigungLaeuft,
    svIstDa,
    kundeTracking.aktiviert,
    kundeTracking.angekommenAm,
    sessionId,
    stop.termin_id,
    onArrived,
    svPosition,
    stop.lat,
    stop.lng,
  ])

  // Phase 3 — Fallback: Terminuhrzeit erreicht und GPS nicht überall
  useEffect(() => {
    if (besichtigungLaeuft) return
    if (permissionState === 'granted' && kundeTracking.aktiviert) return
    const startMs = new Date(stop.start_zeit).getTime()
    const delay = Math.max(0, startMs - Date.now())
    const timer = setTimeout(() => {
      if (besichtigungFiredRef.current) return
      besichtigungFiredRef.current = true
      void markBesichtigungGestartet(sessionId, stop.termin_id, 'termin_uhrzeit')
        .then((res) => {
          if (res.success) {
            onArrived(stop.lat ?? 0, stop.lng ?? 0, 'termin_uhrzeit')
          } else {
            besichtigungFiredRef.current = false
          }
        })
        .catch(() => {
          besichtigungFiredRef.current = false
        })
    }, delay)
    return () => clearTimeout(timer)
  }, [
    besichtigungLaeuft,
    permissionState,
    kundeTracking.aktiviert,
    sessionId,
    stop.termin_id,
    stop.start_zeit,
    stop.lat,
    stop.lng,
    onArrived,
  ])

  function onAbschliessen() {
    startTransition(async () => {
      const res = await completeAndAdvance(sessionId, stop.termin_id)
      if (res.success) {
        toast.success(
          res.nextTerminId ? 'Abgeschlossen, nächster Stop aktiv' : 'Alle Stops erledigt',
        )
        onAdvanced(res.nextTerminId ?? null)
      } else {
        toast.error(res.error ?? 'Abschluss fehlgeschlagen')
      }
    })
  }

  const mapsLink = buildGoogleMapsLink(stop)

  // Status-Hinweis für den SV (ersetzt die alten Action-Buttons)
  const statusHinweis = (() => {
    if (besichtigungLaeuft) return null
    if (svInGeofence && kundeTracking.aktiviert && !kundeTracking.angekommenAm) {
      return 'Du bist vor Ort — warte auf Kunde'
    }
    if (svInGeofence) return 'Ankunft wird gleich bestätigt'
    if (permissionState === 'denied') {
      return 'GPS verweigert — Ankunft wird zur Terminuhrzeit erkannt'
    }
    return 'Auto-Ankunft aktiv (Geofence 100 m)'
  })()

  // C1: Kompakt-Variante (weit weg / keine Distanz) — Glass-Look kommt vom
  // umschließenden GlassPanel, die Card selbst ist transparent. Tap expandiert.
  if (isCompact) {
    return (
      <button
        type="button"
        onClick={() => setManualMode('expanded')}
        aria-label="Stop-Details ausklappen"
        className="w-full text-left rounded-ios-xl text-claimondo-navy px-4 py-3 hover:bg-white/30 transition-colors flex items-center gap-3"
      >
        <MapPinIcon className="w-5 h-5 text-[color:var(--brand-primary,var(--brand-secondary))] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {stop.kennzeichen && (
              <span className="font-mono text-xs font-semibold text-claimondo-navy">{stop.kennzeichen}</span>
            )}
            <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
              {formatUhrzeit(stop.start_zeit)}
            </span>
          </div>
          <p className="text-sm font-medium truncate">{stop.adresse}</p>
        </div>
        {distanceShort && (
          <span className="text-xs font-semibold text-[color:var(--brand-primary,var(--brand-secondary))] shrink-0">
            {distanceShort}
          </span>
        )}
        <ChevronDownIcon className="w-4 h-4 text-claimondo-ondo shrink-0" />
      </button>
    )
  }

  return (
    // 2026-05-08 C9: Card-Background transparent damit der Glass-Effekt vom
    // umschließenden GlassPanel durchkommt — bg-white würde den Backdrop-Blur
    // überschatten (solid weißer Block statt frosted Glass).
    <div className="rounded-ios-xl text-claimondo-navy p-4 space-y-3">
      {/* Header — mit optionalem Collapse-Toggle */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--brand-primary,var(--brand-secondary))]">
            Aktueller Stop
          </span>
          <span className="text-[11px] text-claimondo-ondo">
            {formatUhrzeit(stop.start_zeit)}
          </span>
          {stop.schadentyp && (
            <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-[color:var(--brand-primary,var(--brand-secondary))]/10 text-[color:var(--brand-primary,var(--brand-secondary))] uppercase">
              {stop.schadentyp}
            </span>
          )}
          {/* Collapse-Toggle nur sinnvoll wenn überhaupt eine Distanz da ist
              (sonst keine Info um auf Compact zu schalten). */}
          {distanceShort && (
            <button
              type="button"
              onClick={() => setManualMode('compact')}
              aria-label="Stop-Details einklappen"
              className="text-claimondo-ondo hover:text-claimondo-navy transition-colors"
            >
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-sm font-semibold text-claimondo-navy">
          {stop.kennzeichen && (
            <span className="font-mono mr-2">{stop.kennzeichen}</span>
          )}
          {stop.fahrzeug ?? stop.kunde_name}
        </p>
        <p className="text-xs text-claimondo-ondo">{stop.kunde_name}</p>
      </div>

      {/* Adresse */}
      <div className="flex items-start gap-2 text-sm text-claimondo-navy">
        <MapPinIcon className="w-4 h-4 text-[color:var(--brand-primary,var(--brand-secondary))] mt-0.5" />
        <p className="flex-1">{stop.adresse}</p>
        {distanceShort && (
          <span className="text-xs font-semibold text-[color:var(--brand-primary,var(--brand-secondary))] shrink-0">
            {distanceShort}
          </span>
        )}
      </div>

      {/* Kunde-Tracking-Status */}
      {kundeTracking.angekommenAm ? (
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-ios-lg px-3 py-2">
          <CheckCircle2Icon className="w-4 h-4" />
          Kunde ist vor Ort
        </div>
      ) : kundeTracking.aktiviert ? (
        <div className="flex items-center gap-2 text-xs font-medium text-amber-800 bg-amber-50 rounded-ios-lg px-3 py-2">
          <CarIcon className="w-4 h-4" />
          Kunde unterwegs
          {kundeTracking.etaMinutes != null && (
            <span className="ml-auto">ETA ca. {kundeTracking.etaMinutes} Min</span>
          )}
        </div>
      ) : null}

      {/* Telefonnummer */}
      {stop.kunde_telefon && (
        <a
          href={`tel:${stop.kunde_telefon}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--brand-primary,var(--brand-secondary))] hover:text-[var(--brand-primary)]"
        >
          <PhoneIcon className="w-4 h-4" />
          {stop.kunde_telefon}
        </a>
      )}

      {/* Vorschäden-Hinweis (Cardentity-/Vorschadens-Check) */}
      {stop.hat_vorschaeden && (stop.vorschaden_anzahl ?? 0) > 0 && (
        <div className="rounded-ios-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900">
              {stop.vorschaden_anzahl} Vorschaden{stop.vorschaden_anzahl === 1 ? '' : '-Einträge'} bekannt
            </p>
            {stop.vorschaden_letzter_datum && (
              <p className="text-amber-800 mt-0.5">
                Letzter Eintrag: {new Date(stop.vorschaden_letzter_datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
              </p>
            )}
            <p className="text-amber-800/80 mt-0.5">
              → Vor Ort prüfen, ob sich die Beschädigungen überschneiden.
            </p>
          </div>
        </div>
      )}

      {/* Einzusammelnde Pflichtdokumente vor Ort */}
      {stop.einzusammelnde_dokumente.length > 0 && (
        <div className="rounded-ios-lg border border-[color:var(--brand-primary,var(--brand-secondary))]/20 bg-[color:var(--brand-primary,var(--brand-secondary))]/5 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-claimondo-navy">
            <FileTextIcon className="w-3.5 h-3.5" />
            Einzusammeln vor Ort
            <span className="text-[10px] font-normal text-claimondo-ondo">
              ({stop.einzusammelnde_dokumente.length} offen)
            </span>
          </div>
          <ul className="space-y-0.5 text-xs text-claimondo-navy">
            {stop.einzusammelnde_dokumente.map((d) => (
              <li key={d.slot_id} className="flex items-start gap-1.5">
                <span className="text-claimondo-ondo mt-0.5">•</span>
                <span>{d.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Auftrag-Typ-Badge (wenn nicht erstgutachten) */}
      {stop.auftrag_typ && stop.auftrag_typ !== 'erstgutachten' && (
        <p className="text-[11px] text-claimondo-ondo">
          Auftrag:{' '}
          <span className="font-semibold uppercase text-claimondo-navy">
            {stop.auftrag_typ === 'nachbesichtigung'
              ? 'Nachbesichtigung'
              : stop.auftrag_typ === 'stellungnahme'
                ? 'Stellungnahme'
                : stop.auftrag_typ}
          </span>
        </p>
      )}

      {/* SV-Briefing — C1: Disclosure-Toggle, default collapsed (200–400-Wörter-
          Cardentity-Output nimmt sonst ~80 % der Card; SV öffnet gezielt vor dem Aussteigen). */}
      {stop.briefing_text && (
        <div className="border-t border-claimondo-border pt-3">
          <button
            type="button"
            onClick={() => setBriefingOpen((v) => !v)}
            aria-expanded={briefingOpen}
            className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-claimondo-ondo hover:text-claimondo-navy transition-colors"
          >
            <span>Briefing</span>
            {briefingOpen ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
            {!briefingOpen && (
              <span className="ml-auto text-[10px] normal-case tracking-normal text-claimondo-ondo/70 font-normal">
                Anzeigen
              </span>
            )}
          </button>
          {briefingOpen && (
            <p className="mt-2 text-xs leading-relaxed text-claimondo-navy whitespace-pre-wrap">
              {stop.briefing_text}
            </p>
          )}
        </div>
      )}

      {/* Auto-Ankunft-Hinweis (ersetzt alte Action-Buttons) */}
      {statusHinweis && (
        <div className="rounded-ios-lg bg-[color:var(--brand-primary,var(--brand-secondary))]/5 border border-[color:var(--brand-primary,var(--brand-secondary))]/20 px-3 py-2 text-[11px] text-claimondo-navy">
          {statusHinweis}
        </div>
      )}

      {/* Aktionen */}
      <div className="flex flex-col gap-2 pt-2">
        {besichtigungLaeuft && sessionStatus !== 'finished' && (
          <button
            type="button"
            onClick={onAbschliessen}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-ios-lg bg-[var(--brand-primary)] text-white text-base font-semibold min-h-14 px-4 hover:bg-[var(--brand-primary)] disabled:opacity-50"
          >
            <CheckCircle2Icon className="w-5 h-5" />
            {pending ? 'Schließe ab …' : 'Besichtigung abschließen'}
          </button>
        )}

        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-ios-lg border border-claimondo-border text-claimondo-navy text-sm font-medium min-h-12 px-4 hover:bg-claimondo-bg"
        >
          <NavigationIcon className="w-4 h-4" />
          In Google Maps öffnen
        </a>
      </div>
    </div>
  )
}
