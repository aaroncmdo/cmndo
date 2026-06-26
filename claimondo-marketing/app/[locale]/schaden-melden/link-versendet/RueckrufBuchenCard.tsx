'use client'

// Rueckruftermin-Buchung auf der Bestaetigungsseite. Bucht gegen den BESTEHENDEN
// Lead (bucheRueckrufFuerLead) — KEIN neuer Lead. Zeitfenster-Pattern wie BeratungModal.

import { useState, useTransition } from 'react'
import { Phone, CheckCircle2 } from 'lucide-react'
import { SheetCard } from '@/components/shared/SheetCard'
import { Button } from '@/components/primitives'
import { bucheRueckrufFuerLead } from '@/lib/actions/buche-rueckruf-fuer-lead'

const ZEIT_OPTIONEN = [
  { value: 'jetzt', label: 'So schnell wie möglich' },
  { value: 'vormittags', label: 'Heute Vormittag' },
  { value: 'nachmittags', label: 'Heute Nachmittag' },
  { value: 'abends', label: 'Heute Abend' },
  { value: 'morgen', label: 'Morgen' },
]

export function RueckrufBuchenCard({ leadId }: { leadId: string | null }) {
  const [zeitfenster, setZeitfenster] = useState('jetzt')
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Ohne Lead-ID keine Buchung moeglich (z.B. Direktaufruf der Seite) -> Block ausblenden.
  if (!leadId) return null

  function handleSubmit() {
    setStatus('idle')
    setErrorMsg(null)
    startTransition(async () => {
      const r = await bucheRueckrufFuerLead(leadId as string, zeitfenster)
      if (r.ok) {
        setStatus('sent')
      } else {
        setStatus('error')
        setErrorMsg(r.error ?? 'Rückruf konnte nicht gebucht werden.')
      }
    })
  }

  if (status === 'sent') {
    return (
      <SheetCard size="full" padding="md" animateIn={false}>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" aria-hidden />
          <p className="text-lg font-bold text-claimondo-navy">Wir rufen Sie an</p>
          <p className="max-w-sm text-sm text-claimondo-ondo">
            Ihr Berater meldet sich zur gewünschten Zeit. Sie brauchen nichts weiter zu tun.
          </p>
        </div>
      </SheetCard>
    )
  }

  return (
    <SheetCard size="full" padding="md" animateIn={false}>
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-claimondo-ondo">
        <Phone className="h-4 w-4" aria-hidden />
        Lieber anrufen lassen?
      </p>
      <p className="mt-2 text-sm text-claimondo-shield">
        Wir rufen Sie kostenlos zurück. Wann passt es Ihnen?
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ZEIT_OPTIONEN.map((opt) => {
          const active = zeitfenster === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setZeitfenster(opt.value)}
              className={`rounded-ios-md border px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? 'border-claimondo-navy bg-claimondo-navy text-white'
                  : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {status === 'error' && errorMsg ? (
        <p className="mt-3 text-sm text-red-600">{errorMsg}</p>
      ) : null}
      <div className="mt-4">
        <Button variant="ondo" onClick={handleSubmit} disabled={pending}>
          {pending ? 'Wird gebucht …' : 'Rückruf anfordern'}
        </Button>
      </div>
    </SheetCard>
  )
}
