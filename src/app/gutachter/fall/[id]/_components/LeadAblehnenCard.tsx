'use client'

// Folge-Card aus AAR-926 Followup (SV-Lead-Ablehnung). Erlaubt dem SV, einen
// zugewiesenen Lead vor Besichtigung abzulehnen. Erscheint nur in Status
// sv-zugewiesen + sv-termin. Backend in lib/actions/sv-lead-ablehn-actions.ts.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { XCircleIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
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
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)} iconLeft={<XCircleIcon className="w-4 h-4" />}>
            Lead ablehnen
          </Button>
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
            <Button
              variant="navy"
              size="sm"
              loading={submitting}
              disabled={grund === 'sonstiges' && begruendung.trim().length < 20}
              onClick={handleSubmit}
              iconLeft={<XCircleIcon className="w-4 h-4" />}
            >
              {submitting ? 'Wird abgelehnt…' : 'Lead endgültig ablehnen'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => { setOpen(false); setBegruendung(''); setGrund('terminkonflikt') }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
