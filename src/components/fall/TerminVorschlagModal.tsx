'use client'

// AAR-Phase0 (0.6): Geteiltes Modal für SV-Termin-Aktionen.
// Modes:
//   - erstvorschlag  → neuer Termin (Auftragseingang, noch kein Termin da)
//   - gegenvorschlag → auf Gegenvorschlag-Request vom Kunden antworten
//   - bearbeiten     → bestehenden Termin verschieben
//
// Wird genutzt von: JetztZuTunCard (AAR-395), AuftragCard (AAR-408),
// TerminCard (AAR-397).

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CalendarIcon, XIcon, Loader2Icon } from 'lucide-react'
import { svTerminErstvorschlag } from '@/lib/actions/sv-termin-erstvorschlag'
import { terminGegenvorschlag, terminAnnehmen } from '@/lib/actions/termin-actions'

export type TerminVorschlagMode = 'erstvorschlag' | 'gegenvorschlag' | 'bearbeiten'

export type ExistingTermin = {
  id: string
  status: string
  start_zeit?: string | null
  vorgeschlagenes_datum?: string | null
  gegenvorschlag_von?: 'sv' | 'kunde' | null
} | null

type Props = {
  fallId: string
  existingTermin?: ExistingTermin
  mode: TerminVorschlagMode
  open: boolean
  onClose: () => void
}

function defaultDateTimeLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() + 2) // Default: übermorgen
  d.setHours(10, 0, 0, 0)
  return toDatetimeLocal(d)
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TerminVorschlagModal({
  fallId,
  existingTermin,
  mode,
  open,
  onClose,
}: Props) {
  const router = useRouter()
  const [datetime, setDatetime] = useState<string>(defaultDateTimeLocal())
  const [grund, setGrund] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    // Prefill mit bestehendem Datum, wenn vorhanden
    const source =
      existingTermin?.vorgeschlagenes_datum ?? existingTermin?.start_zeit ?? null
    if (source) {
      try {
        setDatetime(toDatetimeLocal(new Date(source)))
      } catch {
        setDatetime(defaultDateTimeLocal())
      }
    } else {
      setDatetime(defaultDateTimeLocal())
    }
    setGrund('')
  }, [open, existingTermin])

  if (!open) return null

  const title =
    mode === 'erstvorschlag'
      ? 'Termin vorschlagen'
      : mode === 'gegenvorschlag'
        ? 'Gegenvorschlag senden'
        : 'Termin bearbeiten'

  const kundeHatVorgeschlagen =
    existingTermin?.status === 'gegenvorschlag' && existingTermin.gegenvorschlag_von === 'kunde'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const isoDatum = new Date(datetime).toISOString()

    startTransition(async () => {
      let result: { success: boolean; error?: string } = { success: false, error: 'Unbekannt' }

      if (mode === 'erstvorschlag') {
        const r = await svTerminErstvorschlag(fallId, isoDatum, grund || null)
        result = r.success ? { success: true } : { success: false, error: r.error }
      } else {
        // gegenvorschlag + bearbeiten teilen sich dieselbe Action
        result = await terminGegenvorschlag({
          terminId: existingTermin?.id,
          neuesDatum: isoDatum,
          grund: grund || 'Von SV angepasst',
          source: 'sv_portal',
          fallId,
        })
      }

      if (result.success) {
        toast.success(
          mode === 'erstvorschlag'
            ? 'Termin-Vorschlag gesendet'
            : 'Gegenvorschlag gesendet',
        )
        onClose()
        router.refresh()
      } else {
        toast.error(result.error ?? 'Fehler')
      }
    })
  }

  function handleAcceptKundeVorschlag() {
    startTransition(async () => {
      const r = await terminAnnehmen({ source: 'sv_portal', fallId })
      if (r.success) {
        toast.success('Termin angenommen')
        onClose()
        router.refresh()
      } else {
        toast.error(r.error ?? 'Fehler')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-[#4573A2]" />
            <h2 className="text-base font-semibold text-[#0D1B3E]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {kundeHatVorgeschlagen && existingTermin?.vorgeschlagenes_datum && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-900 font-medium mb-2">
                Der Kunde hat folgenden Termin vorgeschlagen:
              </p>
              <p className="text-sm text-[#0D1B3E] font-semibold mb-3">
                {new Date(existingTermin.vorgeschlagenes_datum).toLocaleString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={handleAcceptKundeVorschlag}
                className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50"
              >
                Diesen Termin annehmen
              </button>
              <p className="text-[10px] text-gray-500 mt-2 text-center">
                Oder unten einen anderen Zeitpunkt vorschlagen.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Datum &amp; Uhrzeit</label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={e => setDatetime(e.target.value)}
              required
              className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
            />
          </div>

          {mode !== 'erstvorschlag' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Grund / Notiz (optional)</label>
              <textarea
                value={grund}
                onChange={e => setGrund(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="z.B. anderer Zeitpunkt passt besser ins Einsatzgebiet"
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#4573A2] resize-none"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isPending && <Loader2Icon className="w-4 h-4 animate-spin" />}
              {mode === 'erstvorschlag' ? 'Vorschlag senden' : 'Gegenvorschlag senden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
