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
import { subscribeWhenAuthed } from '@/lib/supabase/realtime-gate'
import type { FeldmodusStop } from './page'
import type { SessionStatus } from '@/lib/types/field-modus'
import { completeAndAdvance, markSvVorOrt, markBesichtigungGestartet } from './actions'
import { enqueueOp } from '@/lib/offline/enqueue'
import { shouldAutoCollapseStopCard } from '@/lib/sv/should-auto-collapse'
import { Button } from '@/components/primitives/Button/Button.web'

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
  // 2026-07-08 (Aaron): sichtbarer Lücken-Hinweis, wenn ein claim-verknüpfter Termin (noch) keine
  // Fahrzeugdaten aus dem Claim hat — der SV sieht die Lücke statt stiller leerer Felder und weiß,
  // dass er sie vor Ort erfassen muss. Claimlose SV-Eigentermine (kein fall_id) triggern es NICHT.
  const claimFahrzeugFehlt = !!stop.fall_id && !stop.kennzeichen && !stop.fahrzeug
  // 2026-05-08 (C1) Smart-Collapse: bei > 500 m Distanz → Card kompakt
  // (Briefing/Pflichtdoku/Aktionen nehmen sonst 80 % des Viewports beim Fahren).
  // Tap expandiert. manualMode überschreibt die Auto-Heuristik in beide Richtungen.
  //
  // 2026-07-17 (Feldmodus-Operativ-Audit): `distanceMeters == null` bedeutet NICHT
  // „weit weg", sondern „UNBEKANNT" (kein Geofence: fehlende Schadenort-Koords, GPS
  // verweigert, Tiefgarage). Frueher kollabierte das die Card PERMANENT → die
  // Primaeraktion „Ich bin angekommen" war versteckt, der SV konnte die Besichtigung
  // nie manuell starten. Deshalb: Unbekannt = ZEIGEN (expanded), nur echte grosse
  // Distanz kollabiert. (Macht auch den statusHinweis „…bestaetige Ihre Ankunft
  // unten…" wahr — der zeigte vorher auf einen ausgeblendeten Button.) Pure Regel +
  // Tests: src/lib/sv/should-auto-collapse.ts.
  const autoCompact = shouldAutoCollapseStopCard(distanceMeters, COMPACT_DISTANCE_THRESHOLD_M)
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
    const cleanupChannel = subscribeWhenAuthed(supabase, () =>
      supabase
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
        ),
    )
    return () => {
      cancelled = true
      cleanupChannel()
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
    if (!navigator.onLine) {
      void enqueueOp({
        kind: 'sv_vor_ort',
        replay_class: 'C',
        payload: {
          terminId: stop.termin_id,
          lat: svPosition?.lat ?? stop.lat ?? 0,
          lng: svPosition?.lng ?? stop.lng ?? 0,
          via: 'geofence',
        },
        entity_ref: { scope: 'feldmodus-termin', id: stop.termin_id },
      }).catch(() => {
        svVorOrtFiredRef.current = false
      })
    } else {
      void markSvVorOrt(
        stop.termin_id,
        svPosition?.lat ?? stop.lat ?? 0,
        svPosition?.lng ?? stop.lng ?? 0,
        'geofence',
      ).catch(() => {
        svVorOrtFiredRef.current = false
      })
    }
  }, [svIstDa, svInGeofence, stop.termin_id, svPosition, stop.lat, stop.lng])

  // Phase 2: Beide vor Ort → besichtigung_gestartet_am
  useEffect(() => {
    if (besichtigungLaeuft || besichtigungFiredRef.current) return
    if (!svIstDa) return
    if (kundeTracking.aktiviert && !kundeTracking.angekommenAm) return
    besichtigungFiredRef.current = true
    if (!navigator.onLine) {
      void enqueueOp({
        kind: 'besichtigung_gestartet',
        replay_class: 'C',
        payload: { terminId: stop.termin_id, sessionId, via: 'beide_angekommen' },
        entity_ref: { scope: 'feldmodus-termin', id: stop.termin_id },
      }).catch(() => {
        besichtigungFiredRef.current = false
      })
      onArrived(
        svPosition?.lat ?? stop.lat ?? 0,
        svPosition?.lng ?? stop.lng ?? 0,
        'geofence',
      )
    } else {
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
    }
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

  // 2026-07-08 (Aaron „immer den tagesmodus von mapbox, nicht uhrzeitabhängig"):
  // Die frühere Phase 3 (Uhrzeit-Auto-Ankunft) ist ENTFERNT. Sie startete die Besichtigung
  // beim Erreichen der Terminuhrzeit — bei einem Termin in der Vergangenheit (delay=0) also
  // SOFORT beim Öffnen des Feldmodus („Besichtigung obwohl nicht beim Termin"). Der Tagesmodus
  // bleibt jetzt IMMER in der Navigation; die Besichtigung startet nur bei echter Ankunft
  // (Geofence, Phase 2) oder wenn der SV sie unten MANUELL bestätigt (onManuellAngekommen).

  // 2026-07-08: Manuelle Ankunft — ersetzt die entfernte Uhrzeit-Auto-Ankunft. Startet die
  // Besichtigung erst, wenn der SV wirklich da ist (auch ohne Geofence/GPS). Nicht uhrzeitabhängig.
  function onManuellAngekommen() {
    if (besichtigungFiredRef.current) return
    besichtigungFiredRef.current = true
    if (!navigator.onLine) {
      void enqueueOp({
        kind: 'besichtigung_gestartet',
        replay_class: 'C',
        payload: { terminId: stop.termin_id, sessionId, via: 'manuell' },
        entity_ref: { scope: 'feldmodus-termin', id: stop.termin_id },
      }).catch(() => {
        besichtigungFiredRef.current = false
      })
      onArrived(svPosition?.lat ?? stop.lat ?? 0, svPosition?.lng ?? stop.lng ?? 0, 'manuell')
      toast.success('Angekommen — wird synchronisiert sobald Sie online sind')
      return
    }
    startTransition(async () => {
      const res = await markBesichtigungGestartet(sessionId, stop.termin_id, 'manuell')
      if (res.success) {
        onArrived(svPosition?.lat ?? stop.lat ?? 0, svPosition?.lng ?? stop.lng ?? 0, 'manuell')
      } else {
        besichtigungFiredRef.current = false
        toast.error(res.error ?? 'Konnte Besichtigung nicht starten')
      }
    })
  }

  function onAbschliessen() {
    startTransition(async () => {
      // Slice 1b: offline -> Abschluss in die Outbox; UI schaltet optimistisch
      // weiter. Der Handler replayed completeAndAdvance mit terminId als CAS-Guard.
      if (!navigator.onLine) {
        void enqueueOp({
          kind: 'sv_complete_advance',
          replay_class: 'C',
          payload: { sessionId, terminId: stop.termin_id },
          entity_ref: { scope: 'feldmodus-session', id: sessionId },
        }).catch(() => {})
        toast.success('Abschluss offline gespeichert — wird synchronisiert')
        onAdvanced(null)
        return
      }
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
      return 'Sie sind vor Ort — warten auf Kunde'
    }
    if (svInGeofence) return 'Ankunft wird gleich bestätigt'
    if (permissionState === 'denied') {
      return 'GPS verweigert — bestätige Ihre Ankunft unten mit „Ich bin angekommen".'
    }
    return 'Auto-Ankunft bei Geofence (100 m) — oder unten manuell bestätigen.'
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
          {stop.kennzeichen ? (
            <span className="font-mono mr-2">{stop.kennzeichen}</span>
          ) : (
            <span className="font-mono mr-2 text-claimondo-ondo/40">—</span>
          )}
          {stop.fahrzeug ?? (
            claimFahrzeugFehlt ? (
              <span className="font-normal italic text-claimondo-ondo/60">Fahrzeug noch nicht erfasst</span>
            ) : (
              stop.kunde_name
            )
          )}
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
        <div className="flex items-center gap-2 text-xs font-medium text-success-strong bg-success-soft rounded-ios-lg px-3 py-2">
          <CheckCircle2Icon className="w-4 h-4" />
          Kunde ist vor Ort
        </div>
      ) : kundeTracking.aktiviert ? (
        <div className="flex items-center gap-2 text-xs font-medium text-warning-strong bg-warning-soft rounded-ios-lg px-3 py-2">
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
        <div className="rounded-ios-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 text-warning-strong shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-warning-strong">
              {stop.vorschaden_anzahl} Vorschaden{stop.vorschaden_anzahl === 1 ? '' : '-Einträge'} bekannt
            </p>
            {stop.vorschaden_letzter_datum && (
              <p className="text-warning-strong mt-0.5">
                Letzter Eintrag: {new Date(stop.vorschaden_letzter_datum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
              </p>
            )}
            <p className="text-warning-strong/80 mt-0.5">
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
        {/* 2026-07-08: Manuelle Ankunft (ersetzt Uhrzeit-Auto-Ankunft) — nur solange die
            Besichtigung noch nicht läuft. Startet die Besichtigung bei echter Ankunft. */}
        {!besichtigungLaeuft && sessionStatus !== 'finished' && (
          <Button
            type="button"
            variant="navy"
            size="lg"
            fullWidth
            onClick={onManuellAngekommen}
            disabled={pending}
            iconLeft={<MapPinIcon className="w-5 h-5" />}
          >
            {pending ? 'Starte …' : 'Ich bin angekommen — Besichtigung starten'}
          </Button>
        )}
        {besichtigungLaeuft && sessionStatus !== 'finished' && (
          <Button
            type="button"
            variant="navy"
            size="lg"
            fullWidth
            onClick={onAbschliessen}
            disabled={pending}
            iconLeft={<CheckCircle2Icon className="w-5 h-5" />}
          >
            {pending ? 'Schließe ab …' : 'Besichtigung abschließen'}
          </Button>
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
