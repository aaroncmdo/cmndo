'use client'

// AAR-386: Fokus-Modus-Fallakte im arrived-State.
// Ersetzt die RouteSidebar sobald der SV angekommen ist. Zeigt kompakte
// Kopfzeile (Kunde, Kennzeichen, Fahrzeug), Pflichtdokumente-Upload
// (shared DokumentenListe → DokumentSlot mit capture="environment"),
// Vor-Ort-Notizen (Textarea mit Auto-Save via Blur + Save-Button) und
// den Besichtigung-abschliessen-Button.

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeftIcon,
  Loader2Icon,
  PhoneIcon,
  RefreshCwIcon,
  SaveIcon,
} from 'lucide-react'
import DokumentenListe, { type SlotRow } from '@/components/fall/DokumentenListe'
import {
  loadFeldmodusFallakteData,
  saveFeldmodusNotizen,
  type FeldmodusFallakteFall,
  type FeldmodusSlot,
} from './fallakte/actions'
import BesichtigungAbschliessenButton from './BesichtigungAbschliessenButton'

export interface SvFallakteViewProps {
  fallId: string
  sessionId: string
  terminId: string
  onAdvanced: (nextTerminId: string | null) => void
  onPauseBackToRoute: () => void
}

export default function SvFallakteView({
  fallId,
  sessionId,
  terminId,
  onAdvanced,
  onPauseBackToRoute,
}: SvFallakteViewProps) {
  const [loading, setLoading] = useState(true)
  const [fall, setFall] = useState<FeldmodusFallakteFall | null>(null)
  const [slots, setSlots] = useState<FeldmodusSlot[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notizen, setNotizen] = useState('')
  const [notizenDirty, setNotizenDirty] = useState(false)
  const [savingNotizen, startSavingNotizen] = useTransition()

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await loadFeldmodusFallakteData(fallId)
    if (res.success) {
      setFall(res.fall)
      setSlots(res.slots)
      // Notizen nur initial setzen, nicht überschreiben wenn User tippt
      setNotizen((prev) => (notizenDirty ? prev : res.fall.notizen ?? ''))
    } else {
      setLoadError(res.error)
    }
    setLoading(false)
  }, [fallId, notizenDirty])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallId])

  const pflichtOffen = slots.filter(
    (s) => s.istPflicht && s.status !== 'hochgeladen' && s.status !== 'geprueft',
  ).length

  const handleSaveNotizen = () => {
    if (!notizenDirty || savingNotizen) return
    startSavingNotizen(async () => {
      const res = await saveFeldmodusNotizen(fallId, notizen)
      if (res.success) {
        setNotizenDirty(false)
        toast.success('Notizen gespeichert')
      } else {
        toast.error(res.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  const listeSlots: SlotRow[] = slots.map((s) => ({
    id: s.id,
    slotId: s.slotId,
    label: s.label,
    beschreibung: s.beschreibung,
    istPflicht: s.istPflicht,
    status: s.status,
    currentFile: s.currentFile,
  }))

  return (
    <div className="h-full flex flex-col bg-[#0D1B3E]/95 backdrop-blur-md text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <button
          type="button"
          onClick={onPauseBackToRoute}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/80"
          aria-label="Zurück zur Route"
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
            <div className="bg-white rounded-2xl p-4 text-[#0D1B3E] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">
                    Fall #{fall.fall_nummer}
                  </p>
                  {fall.kennzeichen && (
                    <p className="text-sm font-semibold text-[#0D1B3E]">
                      {fall.kennzeichen}
                    </p>
                  )}
                </div>
                {fall.kunde_telefon && (
                  <a
                    href={`tel:${fall.kunde_telefon}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#4573A2] hover:text-[#1E3A5F]"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    {fall.kunde_telefon}
                  </a>
                )}
              </div>
              {fall.fahrzeug && (
                <p className="text-xs text-gray-700">{fall.fahrzeug}</p>
              )}
              {fall.szenario && (
                <p className="text-[11px] text-gray-500">
                  Szenario: {fall.szenario}
                </p>
              )}
              {fall.besichtigungsort_adresse && (
                <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-2">
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
            <div className="bg-white rounded-2xl p-4 text-[#0D1B3E]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
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
              <DokumentenListe
                slots={listeSlots}
                fallId={fall.id}
                rolle="sachverstaendiger"
              />
            </div>

            {/* Notizen */}
            <div className="bg-white rounded-2xl p-4 text-[#0D1B3E]">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="sv-feldmodus-notizen"
                  className="text-xs font-semibold uppercase tracking-wider text-gray-500"
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
                }}
                onBlur={handleSaveNotizen}
                rows={5}
                placeholder="Was ist bei der Besichtigung aufgefallen?"
                className="w-full text-xs text-[#0D1B3E] border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#4573A2] resize-none"
              />
              <button
                type="button"
                onClick={handleSaveNotizen}
                disabled={!notizenDirty || savingNotizen}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-[#4573A2] hover:bg-[#1E3A5F] disabled:bg-gray-300 rounded-lg py-2"
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
      <div className="px-4 py-3 border-t border-white/10 bg-[#0D1B3E]">
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
