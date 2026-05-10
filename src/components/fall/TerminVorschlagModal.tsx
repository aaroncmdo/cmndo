'use client'

// AAR-Phase0 (0.6) / CMM-25: Geteiltes Modal für SV-Termin-Aktionen.
// Modes (CMM-25 hat 'erstvorschlag' entfernt — Termin wird vom Dispatcher
// gesetzt + durch SA-Unterschrift bestätigt; SV macht keinen Erstvorschlag
// mehr):
//   - gegenvorschlag → SV schickt einen alternativen Termin
//   - bearbeiten     → bestehenden Termin verschieben (Gegenvorschlag-Variante)
//
// Wird genutzt von: TerminCard (AAR-397), TerminActionsPanel (CMM-25 indirekt
// — Panel hat eigene Inline-Modals, dieses hier nur fürs Card-Edit).

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CalendarIcon, XIcon, Loader2Icon } from 'lucide-react'
import { Modal } from '@/components/primitives/Modal'
import { terminGegenvorschlag } from '@/lib/actions/termin-actions'

export type TerminVorschlagMode = 'gegenvorschlag' | 'bearbeiten'

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

  const title = mode === 'gegenvorschlag' ? 'Gegenvorschlag senden' : 'Termin bearbeiten'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const isoDatum = new Date(datetime).toISOString()

    startTransition(async () => {
      const result = await terminGegenvorschlag({
        terminId: existingTermin?.id,
        neuesDatum: isoDatum,
        grund: grund || 'Von SV angepasst',
        source: 'sv_portal',
        fallId,
      })

      if (result.success) {
        toast.success('Gegenvorschlag gesendet')
        onClose()
        router.refresh()
      } else {
        toast.error(result.error ?? 'Fehler')
      }
    })
  }

  return (
    <Modal open onClose={onClose} placement="bottom-sheet" noPadding hideCloseButton maxWidth={512} ariaLabel={title}>
      <div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border sticky top-0 bg-white/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-claimondo-ondo" />
            <h2 className="text-base font-semibold text-claimondo-navy">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-claimondo-ondo/70 hover:text-claimondo-ondo"
            aria-label="Schließen"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">Datum &amp; Uhrzeit</label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={e => setDatetime(e.target.value)}
              required
              className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
            />
          </div>

          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">Grund / Notiz (optional)</label>
            <textarea
              value={grund}
              onChange={e => setGrund(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="z.B. anderer Zeitpunkt passt besser ins Einsatzgebiet"
              className="w-full bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[#4573A2] resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm text-claimondo-ondo hover:bg-[#f8f9fb] transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isPending && <Loader2Icon className="w-4 h-4 animate-spin" />}
              Gegenvorschlag senden
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
