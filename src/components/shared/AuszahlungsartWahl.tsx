'use client'

// Auszahlungsart aendern — von Kunde UND Sachverstaendigem genutzt (Aaron 30.08.:
// „beide sollen es ändern können. aber das gutachten ist final").
//
// Bewusst EINE Komponente fuer beide Rollen: die Optionen, die Sperr-Anzeige und die
// Formulierung sind identisch. Zwei Kopien wuerden auseinanderlaufen — und die Sperre ist
// genau die Zusage, die an beiden Stellen gleich aussehen muss.
//
// Die Sperre selbst wird SERVERSEITIG in setzeAuszahlungsart durchgesetzt; `gesperrt` hier
// ist nur die Anzeige. Ein deaktivierter Button ist kein Schutz.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

const OPTIONEN = [
  { wert: 'reparatur', label: 'Reparatur', hinweis: 'Das Fahrzeug wird in einer Werkstatt instand gesetzt.' },
  { wert: 'fiktiv', label: 'Fiktive Abrechnung', hinweis: 'Auszahlung auf Gutachtenbasis (netto, ohne Mehrwertsteuer).' },
  { wert: 'unentschieden', label: 'Noch offen', hinweis: 'Die Entscheidung fällt später.' },
] as const

export function AuszahlungsartWahl({
  aktuell,
  gesperrt,
  gesperrtSeit,
  onWaehlen,
}: {
  aktuell: string | null
  gesperrt: boolean
  /** ISO-Datum der Gutachten-Fertigstellung — begruendet die Sperre statt sie nur zu behaupten. */
  gesperrtSeit?: string | null
  onWaehlen: (wert: string) => Promise<{ success?: boolean; ok?: boolean; error?: string }>
}) {
  const [wert, setWert] = useState<string | null>(aktuell)
  const [pending, startTransition] = useTransition()
  const [laedt, setLaedt] = useState<string | null>(null)

  async function waehle(neu: string) {
    if (gesperrt || neu === wert) return
    setLaedt(neu)
    const res = await onWaehlen(neu)
    setLaedt(null)
    const ok = res.success ?? res.ok ?? false
    if (!ok) {
      toast.error(res.error ?? 'Änderung fehlgeschlagen')
      return
    }
    setWert(neu)
    toast.success('Abrechnungsart aktualisiert.')
    startTransition(() => {})
  }

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-2">
        {OPTIONEN.map((o) => {
          const aktiv = wert === o.wert
          return (
            <button
              key={o.wert}
              type="button"
              disabled={gesperrt || pending || laedt !== null}
              onClick={() => waehle(o.wert)}
              aria-pressed={aktiv}
              className={[
                'text-left rounded-ios-md border px-4 py-3 transition-colors',
                aktiv
                  ? 'border-claimondo-ondo bg-claimondo-ondo/10'
                  : 'border-claimondo-border bg-white hover:bg-claimondo-bg',
                gesperrt ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <span className="block text-body-sm font-medium text-claimondo-navy">
                {o.label}
                {laedt === o.wert && ' …'}
              </span>
              <span className="block text-caption text-claimondo-ondo mt-0.5">{o.hinweis}</span>
            </button>
          )
        })}
      </div>

      {gesperrt && (
        <p className="text-caption text-claimondo-ondo mt-2">
          Das Gutachten liegt vor
          {gesperrtSeit
            ? ` (seit ${new Date(gesperrtSeit).toLocaleDateString('de-DE', {
                timeZone: 'Europe/Berlin',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })})`
            : ''}{' '}
          — die Abrechnungsart steht damit fest und ist nicht mehr änderbar.
        </p>
      )}
    </div>
  )
}
