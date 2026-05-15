'use client'

// Folge-Card aus AAR-926 Followup (SV-Lead-Ablehnung). Erlaubt dem SV, einen
// zugewiesenen Lead vor Besichtigung abzulehnen. Erscheint nur in Status
// sv-zugewiesen + sv-termin. Backend in lib/actions/sv-lead-ablehn-actions.ts.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XCircleIcon, Loader2Icon } from 'lucide-react'
import { lehneLeadAb, type AblehnungsGrund } from '@/lib/actions/sv-lead-ablehn-actions'

const GRUENDE: { key: AblehnungsGrund; label: string }[] = [
  { key: 'terminkonflikt', label: 'Terminkonflikt — kann den Termin nicht halten' },
  { key: 'kein_haftpflichtschaden', label: 'Kein Haftpflicht-Schaden (Bagatelle/Eigenverschulden/Kasko)' },
  { key: 'entfernung', label: 'Entfernung zu groß' },
  { key: 'kapazitaet', label: 'Aktuell keine Kapazität' },
  { key: 'sonstiges', label: 'Sonstiges (Begründung Pflicht)' },
]

type Props = {
  fallId: string
  status: string | null
}

export function LeadAblehnenCard({ fallId, status }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [grund, setGrund] = useState<AblehnungsGrund>('terminkonflikt')
  const [begruendung, setBegruendung] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!status || !['sv-zugewiesen', 'sv-termin'].includes(status)) return null

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const result = await lehneLeadAb(fallId, grund, grund === 'sonstiges' ? begruendung : undefined)
      if (!result.ok) {
        toast.error(result.error ?? 'Ablehnung fehlgeschlagen')
        setSubmitting(false)
        return
      }
      toast.success('Lead abgelehnt. Dispatch sucht neuen SV.')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ablehnung fehlgeschlagen')
      setSubmitting(false)
    }
  }

  return (
    <section className="bg-white rounded-ios-md border border-claimondo-border p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo flex items-center gap-2">
        <XCircleIcon className="w-3.5 h-3.5" /> Lead ablehnen
      </h3>

      {!open ? (
        <>
          <p className="text-xs text-claimondo-ondo/80">
            Wenn du diesen Lead nicht annehmen kannst, lehne ihn jetzt ab. Dispatch sucht dann
            sofort einen neuen Sachverständigen. Du wirst nicht abgerechnet.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 bg-claimondo-bg hover:bg-claimondo-border border border-claimondo-border text-claimondo-navy text-sm font-medium py-2 px-3 rounded-ios-lg transition-colors"
          >
            <XCircleIcon className="w-4 h-4" /> Lead ablehnen
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-claimondo-ondo mb-1">Grund</label>
            <select
              value={grund}
              onChange={(e) => setGrund(e.target.value as AblehnungsGrund)}
              className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
            >
              {GRUENDE.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </div>

          {grund === 'sonstiges' && (
            <div>
              <label className="block text-[11px] font-medium text-claimondo-ondo mb-1">
                Begründung (min. 20 Zeichen)
              </label>
              <textarea
                value={begruendung}
                onChange={(e) => setBegruendung(e.target.value)}
                rows={3}
                placeholder="Bitte gib eine konkrete Begründung an…"
                className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo"
              />
              <p className="text-[10px] text-claimondo-ondo/70 mt-1">
                {begruendung.trim().length} / 20 Zeichen
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting || (grund === 'sonstiges' && begruendung.trim().length < 20)}
              className="inline-flex items-center gap-2 bg-claimondo-navy hover:bg-claimondo-ondo disabled:bg-claimondo-border disabled:text-claimondo-ondo/50 text-white text-sm font-medium py-2 px-3 rounded-ios-lg transition-colors"
            >
              {submitting ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <XCircleIcon className="w-4 h-4" />}
              {submitting ? 'Wird abgelehnt…' : 'Lead endgültig ablehnen'}
            </button>
            <button
              onClick={() => { setOpen(false); setBegruendung(''); setGrund('terminkonflikt') }}
              disabled={submitting}
              className="inline-flex items-center bg-white hover:bg-claimondo-bg border border-claimondo-border text-claimondo-navy text-sm font-medium py-2 px-3 rounded-ios-lg transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
