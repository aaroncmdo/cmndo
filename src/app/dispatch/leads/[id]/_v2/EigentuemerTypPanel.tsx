'use client'

// P2d-4 Task 6b: Eigentuemer-Typ-Selector (Task-0-Gate, Aaron Option 1 incl. VAT).
// Schreibt finanzierung_leasing + vorsteuerabzugsberechtigt via saveStammdaten.
// Legacy-Referenz: _phases/Phase4Stammdaten.tsx Z. 753-865.

import { useState, useTransition } from 'react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button/Button.web'
import { saveStammdaten } from '../_actions/stammdaten'

export type EigentuemerTypPanelProps = {
  leadId: string
  initialFinanzierungLeasing: string | null
  initialVorsteuer: boolean | null
}

export function EigentuemerTypPanel({
  leadId,
  initialFinanzierungLeasing,
  initialVorsteuer,
}: EigentuemerTypPanelProps) {
  const [fl, setFl] = useState<string | null>(initialFinanzierungLeasing)
  const [vs, setVs] = useState<boolean | null>(initialVorsteuer)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save(nextFl: string, nextVs: boolean) {
    setFl(nextFl)
    setVs(nextVs)
    setError(null)
    startTransition(async () => {
      const r = await saveStammdaten(leadId, {
        finanzierung_leasing: nextFl,
        vorsteuerabzugsberechtigt: nextVs,
      })
      if (!r?.success) {
        setError(r?.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  const isPrivat = (fl ?? 'keine') === 'keine' && !vs
  const isLeasing = fl === 'leasing' && !vs
  const isGewerblich = vs === true

  return (
    <SectionCard
      title="Fahrzeug-Eigentümer (laut Fahrzeugschein/ZB1)"
      subtitle="Wer steht als Halter im Fahrzeugschein? Nicht zwingend der Anrufer."
    >
      <div className="flex gap-2">
        <Button
          variant={isPrivat ? 'ondo' : 'ghost'}
          size="sm"
          fullWidth
          disabled={pending}
          ariaLabel="Privat — Kunde ist Eigentümer, nicht vorsteuerabzugsberechtigt"
          onClick={() => save('keine', false)}
        >
          Privat
        </Button>
        <Button
          variant={isLeasing ? 'ondo' : 'ghost'}
          size="sm"
          fullWidth
          disabled={pending}
          ariaLabel="Leasing — Leasingfahrzeug, Vollmacht vom Leasinggeber nötig"
          onClick={() => save('leasing', false)}
        >
          Leasing
        </Button>
        <Button
          variant={isGewerblich ? 'ondo' : 'ghost'}
          size="sm"
          fullWidth
          disabled={pending}
          ariaLabel="Gewerblich — Firma als Eigentümer, Netto-Regulierung"
          onClick={() => save('keine', true)}
        >
          Gewerblich
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-red-600">{error}</p>
      )}

      {fl === 'leasing' && (
        <div className="mt-2 rounded-ios-md bg-amber-50 border border-amber-200 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-amber-900">
            Gesprächshilfe bei Leasing
          </p>
          <p className="text-[10px] text-amber-800 italic">
            „Falls Sie Fragen wegen Ihrer Leasingbank haben — das klären wir nach dem Gutachten gemeinsam. Sie müssen jetzt nichts tun."
          </p>
        </div>
      )}

      {fl === 'finanzierung' && (
        <div className="mt-2 rounded-ios-md bg-amber-50 border border-amber-200 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-amber-900">
            Gesprächshilfe bei Finanzierung
          </p>
          <p className="text-[10px] text-amber-800 italic">
            „Bei finanziertem Fahrzeug informieren wir Sie nach dem Gutachten über die nächsten Schritte."
          </p>
        </div>
      )}

      {vs === true && (
        <div className="mt-2 rounded-ios-md bg-claimondo-navy/5 border border-claimondo-ondo/30 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-claimondo-navy">
            Hinweis bei Gewerblich
          </p>
          <ul className="list-disc list-inside text-[10px] text-claimondo-navy">
            <li>Firma als Eigentümer → Gutachten an Firma adressieren</li>
            <li>Regulierung NETTO (Versicherung zieht USt. ab)</li>
            <li>Bei Gewerbenachweis-Pflicht: FlowLink zeigt Upload-Slot automatisch</li>
          </ul>
        </div>
      )}
    </SectionCard>
  )
}
