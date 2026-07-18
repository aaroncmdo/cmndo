'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { WerkstattFinder } from '@/components/werkstatt/finder/WerkstattFinder'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { waehleWerkstattAusEmpfehlung, type EmpfehlungView } from './actions'

function eur(n: number | null): string | null {
  if (n == null) return null
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function WerkstattEmpfehlungClient({ token, data }: { token: string; data: EmpfehlungView }) {
  const [done, setDone] = useState(data.status === 'entschieden')
  const [pending, startTransition] = useTransition()

  function waehlen(werkstattId: string) {
    startTransition(async () => {
      const res = await waehleWerkstattAusEmpfehlung(token, werkstattId)
      if (!res.ok) {
        toast.error(res.error ?? 'Auswahl fehlgeschlagen')
        return
      }
      setDone(true)
    })
  }

  if (done) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-ios-lg p-8 text-center shadow-claimondo-lg shadow-black/10">
          <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-success-strong">✓</span>
          </div>
          <h1 className="text-xl font-semibold text-claimondo-navy mb-2">Werkstatt ausgewählt</h1>
          <p className="text-sm text-claimondo-ondo mb-6">
            Vielen Dank. Die Werkstatt wurde informiert und meldet sich zur Terminabstimmung bei Ihnen.
            Melden Sie sich in Ihrem Portal an, um alles zu verfolgen.
          </p>
          <a
            href="/login"
            className="inline-block rounded-ios-lg bg-claimondo-navy px-5 py-3 text-sm font-semibold text-white"
          >
            Zum Portal
          </a>
        </div>
      </div>
    )
  }

  const reparaturkosten = eur(data.gutachten.reparaturkostenBrutto)

  return (
    <div className="min-h-screen bg-claimondo-bg p-4">
      <div className="max-w-lg mx-auto py-6">
        <div className="bg-white rounded-ios-lg p-6 shadow-claimondo-lg shadow-black/10 mb-4">
          <p className="text-xs uppercase tracking-wide text-claimondo-ondo mb-1">Werkstatt-Empfehlung</p>
          <h1 className="text-lg font-semibold text-claimondo-navy">
            {data.gutachter.firma || data.gutachter.name} empfiehlt Ihnen eine Werkstatt
          </h1>
          <p className="text-sm text-claimondo-ondo mt-1">
            Ihr Gutachter {data.gutachter.name} hat passende Partner-Werkstätten für Ihre Reparatur ausgewählt.
            Wählen Sie eine aus — die Werkstatt kümmert sich dann um die Terminabstimmung.
          </p>
          {data.gutachter.ratingDurchschnitt != null && data.gutachter.ratingAnzahl != null && (
            <div className="mt-2">
              <GoogleBewertungBadge
                durchschnitt={data.gutachter.ratingDurchschnitt}
                anzahl={data.gutachter.ratingAnzahl}
                zuletztAktualisiert={null}
                size="sm"
              />
            </div>
          )}
          {reparaturkosten && (
            <div className="mt-3 rounded-ios-md bg-claimondo-bg px-4 py-3">
              <p className="text-xs text-claimondo-ondo">Voraussichtliche Reparaturkosten (lt. Gutachten)</p>
              <p className="text-sm font-semibold text-claimondo-navy">{reparaturkosten}</p>
            </div>
          )}
        </div>
        <WerkstattFinder werkstaetten={data.werkstaetten} onSelect={waehlen} loading={pending} />
      </div>
    </div>
  )
}
