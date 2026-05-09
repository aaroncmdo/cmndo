'use client'

// AAR-386: Fokus-Modus-Fallakte im arrived-State.
// Ersetzt die RouteSidebar sobald der SV angekommen ist. Zeigt kompakte
// Kopfzeile (Kunde, Kennzeichen, Fahrzeug), Pflichtdokumente-Upload
// (FeldmodusDokumentSlot mit in-app KameraModal + Datei-Fallback),
// Vor-Ort-Notizen (Textarea mit Auto-Save via Blur + Save-Button) auf
// `faelle.sv_notizen_vor_ort` und den Besichtigung-abschliessen-Button.
// Realtime-Subscription auf pflichtdokumente + faelle hält die Ansicht
// ohne manuellen Reload aktuell.

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  Loader2Icon,
  PhoneIcon,
  RefreshCwIcon,
  SaveIcon,
  XIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  loadFeldmodusFallakteData,
  saveFeldmodusNotizen,
  type FeldmodusFallakteFall,
  type FeldmodusSlot,
} from './_fallakte/actions'
import BesichtigungAbschliessenButton from './BesichtigungAbschliessenButton'
import FeldmodusDokumentSlot from './FeldmodusDokumentSlot'

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
  const [slots, setSlots] = useState<FeldmodusSlot[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notizen, setNotizen] = useState('')
  const [notizenDirty, setNotizenDirty] = useState(false)
  const [savingNotizen, startSavingNotizen] = useTransition()
  const notizenDirtyRef = useRef(false)

  const supabase = useMemo(() => createClient(), [])
  // 2026-05-07: useId-Suffix verhindert „cannot add postgres_changes
  // callbacks after subscribe()"-Crash bei Strict-Mode-Doppel-Mount.
  // Channel-Namen müssen pro Consumer-Instanz eindeutig sein. Siehe
  // Memory feedback_realtime_channel_ids.
  const channelSuffix = useId()

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await loadFeldmodusFallakteData(fallId)
    if (res.success) {
      setFall(res.fall)
      setSlots(res.slots)
      // Notizen nur setzen wenn User gerade nicht selbst getippt hat — sonst
      // würde eine Realtime-Update-Schleife die Eingabe überschreiben.
      if (!notizenDirtyRef.current) {
        setNotizen(res.fall.sv_notizen_vor_ort ?? '')
      }
    } else {
      setLoadError(res.error)
    }
    setLoading(false)
  }, [fallId])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallId])

  // AAR-386 Nachzug: Realtime-Subscription auf pflichtdokumente für diesen Fall.
  // Wenn ein Upload hochläuft (z. B. durch Kunden-Upload-Portal oder Admin-
  // Rückmeldung) und der Status sich ändert, wird der Slot-State refresht
  // ohne dass der SV manuell neu laden muss.
  useEffect(() => {
    const channel = supabase
      .channel(`feldmodus-fallakte-${fallId}-${channelSuffix}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pflichtdokumente',
          filter: `fall_id=eq.${fallId}`,
        },
        () => {
          void reload()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'faelle',
          filter: `id=eq.${fallId}`,
        },
        () => {
          void reload()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, fallId, channelSuffix, reload])

  const pflichtOffen = slots.filter(
    (s) => s.istPflicht && s.status !== 'hochgeladen' && s.status !== 'geprueft',
  ).length

  const handleSaveNotizen = () => {
    if (!notizenDirty || savingNotizen) return
    startSavingNotizen(async () => {
      const res = await saveFeldmodusNotizen(fallId, notizen)
      if (res.success) {
        setNotizenDirty(false)
        notizenDirtyRef.current = false
        toast.success('Notizen gespeichert')
      } else {
        toast.error(res.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

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
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80"
            aria-label="Zurück zur Anfahrt-Karte"
            title="Zurück zur Anfahrt-Karte"
          >
            <XIcon className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onPauseBackToRoute}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/80"
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
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 disabled:opacity-50"
          aria-label="Neu laden"
        >
          <RefreshCwIcon
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadError ? (
          <div className="p-4 text-xs text-red-300 bg-red-900/30 m-4 rounded-lg">
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
                    Fall #{fall.fall_nummer}
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

            {/* Dokumente (shared DokumentenListe) */}
            <div className="bg-white rounded-2xl p-4 text-[var(--brand-primary)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                  Dokumente
                </p>
                {pflichtOffen > 0 ? (
                  <span className="text-[10px] font-medium text-amber-700">
                    {pflichtOffen} Pflicht offen
                  </span>
                ) : slots.some((s) => s.istPflicht) ? (
                  <span className="text-[10px] font-medium text-green-700">
                    Alle Pflicht erledigt
                  </span>
                ) : null}
              </div>
              {slots.length === 0 ? (
                <p className="text-xs text-claimondo-ondo italic">
                  Keine Dokumente angefordert.
                </p>
              ) : (
                <div className="space-y-2">
                  {slots.map((s) => (
                    <FeldmodusDokumentSlot
                      key={`${s.slotId}-${s.id ?? 'new'}`}
                      fallId={fall.id}
                      slotId={s.id}
                      slotLabel={s.label}
                      beschreibung={s.beschreibung}
                      dokumentTyp={s.slotId}
                      istPflicht={s.istPflicht}
                      status={s.status}
                      currentFile={s.currentFile}
                      onUploaded={() => void reload()}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Notizen */}
            <div className="bg-white rounded-2xl p-4 text-[var(--brand-primary)]">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="sv-feldmodus-notizen"
                  className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo"
                >
                  Vor-Ort-Notizen
                </label>
                {notizenDirty && (
                  <span className="text-[10px] text-amber-700">
                    Ungesichert
                  </span>
                )}
              </div>
              <textarea
                id="sv-feldmodus-notizen"
                value={notizen}
                onChange={(e) => {
                  setNotizen(e.target.value)
                  setNotizenDirty(true)
                  notizenDirtyRef.current = true
                }}
                onBlur={handleSaveNotizen}
                rows={5}
                placeholder="Was ist bei der Besichtigung aufgefallen?"
                className="w-full text-xs text-[var(--brand-primary)] border border-claimondo-border rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-secondary)] resize-none"
              />
              <button
                type="button"
                onClick={handleSaveNotizen}
                disabled={!notizenDirty || savingNotizen}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-primary)] disabled:bg-claimondo-border rounded-lg py-2"
              >
                {savingNotizen ? (
                  <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <SaveIcon className="w-3.5 h-3.5" />
                )}
                Notizen speichern
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Sticky Footer mit Abschluss-Button */}
      <div className="px-4 py-3 border-t border-white/10 bg-[var(--brand-primary)]">
        <BesichtigungAbschliessenButton
          sessionId={sessionId}
          terminId={terminId}
          pflichtOffen={pflichtOffen}
          onAdvanced={onAdvanced}
        />
      </div>
    </div>
  )
}
