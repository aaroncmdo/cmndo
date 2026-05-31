'use client'

// AAR-940 Phase 3: Selbst-Quali (Schuldfrage) als self-contained Step auf der
// Token-Strecke. Auto-Submit pro Option -> speichereQuali (service_role, Gate).
// Policy: nur Eigenverschulden -> kein Termin (fairer Hinweis). Sonst weiter.
// Phase 4 (Termin-Buchung via sv-matching-modul) ersetzt den 'weiter'-Zustand.

import { useState } from 'react'
import { speichereQuali } from './actions'

const OPTIONEN: { value: string; label: string; hint: string }[] = [
  { value: 'gegner', label: 'Der Unfallgegner', hint: 'Die Gegenseite hat den Schaden verursacht.' },
  { value: 'unklar', label: 'Noch unklar', hint: 'Die Schuldfrage ist noch nicht eindeutig geklärt.' },
  { value: 'eigenverantwortung', label: 'Ich selbst', hint: 'Ich habe den Unfall selbst verursacht.' },
]

type Phase = 'frage' | 'sende' | 'weiter' | 'abbruch' | 'fehler'

export function SelbstQualiClient({ token, vorname }: { token: string; vorname: string | null }) {
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

  async function waehle(value: string) {
    setPhase('sende')
    setFehler(null)
    try {
      const r = await speichereQuali(token, value)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? 'Es ist ein Fehler aufgetreten.')
        return
      }
      setPhase(r.ergebnis === 'abbruch' ? 'abbruch' : 'weiter')
    } catch {
      setPhase('fehler')
      setFehler('Es ist ein unerwarteter Fehler aufgetreten.')
    }
  }

  if (phase === 'abbruch') {
    return (
      <div className="max-w-md text-center" data-testid="quali-abbruch">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Danke für Ihre Angaben</h1>
        <p className="text-claimondo-navy/80 mb-2">
          Bei selbstverschuldeten Unfällen lassen sich die Gutachterkosten leider nicht über die
          gegnerische Haftpflichtversicherung regulieren — daher können wir Ihnen hier keinen
          kostenfreien Termin anbieten.
        </p>
        <p className="text-claimondo-navy/60 text-sm">
          Sollte sich die Schuldfrage noch ändern, melden Sie sich jederzeit gern wieder.
        </p>
      </div>
    )
  }

  if (phase === 'weiter') {
    return (
      <div className="max-w-md text-center" data-testid="quali-weiter">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">Perfekt — weiter geht&apos;s</h1>
        <p className="text-claimondo-navy/70">
          Als Nächstes wählen Sie Ihren Gutachter und Ihren Wunschtermin. (Terminbuchung folgt.)
        </p>
      </div>
    )
  }

  if (phase === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler}</p>
      </div>
    )
  }

  return (
    <div className="max-w-md w-full">
      {vorname && (
        <p className="text-claimondo-navy/60 text-sm mb-1 text-center">Hallo {vorname},</p>
      )}
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
        Wer hat den Unfall verursacht?
      </h1>
      <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
        Das hilft uns einzuschätzen, ob wir Ihren Schaden für Sie regulieren können.
      </p>
      <div className="flex flex-col gap-3">
        {OPTIONEN.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`quali-schuldfrage-${opt.value}`}
            disabled={phase === 'sende'}
            onClick={() => waehle(opt.value)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo disabled:opacity-50"
          >
            <span className="block font-semibold text-claimondo-navy">{opt.label}</span>
            <span className="block text-sm text-claimondo-navy/60">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
