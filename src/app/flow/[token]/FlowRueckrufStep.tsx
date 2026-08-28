'use client'

// Teilschuld-Zweig (Aaron 14.07.): Bei ungeklärter Haftung buchen wir KEINEN Gutachter, sondern einen
// Rückruf beim Dispatch — die Schuldfrage muss erst persönlich geklärt werden. Danach läuft der Fall
// als Haftpflicht weiter (der Dispatcher setzt schuldfrage='gegner').
//
// Der Rückruf landet über upsertReservierungsRueckruf in admin_termine (typ='rueckruf', status='offen')
// und damit in der Dispatch-Queue. Der frühere Flow-Pfad setzte nur leads.status='rueckruf' und
// erzeugte KEINEN Task — so ein "Rückruf" tauchte beim Dispatch nie auf.

import { useState } from 'react'
import { PhoneCallIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { fordereRueckrufAn } from './self-service-actions'

type Phase = 'frage' | 'sendet' | 'fertig' | 'fehler'

export function FlowRueckrufStep({
  token,
  vorname,
}: {
  token: string
  vorname?: string | null
}) {
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

  async function anfordern() {
    setPhase('sendet')
    const r = await fordereRueckrufAn(token)
    if (!r.ok) {
      setFehler(r.error ?? 'Der Rückruf konnte nicht angelegt werden.')
      setPhase('fehler')
      return
    }
    setPhase('fertig')
  }

  if (phase === 'fertig') {
    return (
      <div className="py-8 text-center" data-testid="rueckruf-bestaetigt">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
          <CheckIcon className="h-7 w-7 text-success-strong" />
        </div>
        <h2 className="text-heading-md font-semibold text-claimondo-navy mb-2">
          Wir rufen Sie zurück
        </h2>
        <p className="text-body-sm text-claimondo-ondo leading-relaxed">
          Einer unserer Berater meldet sich in der Regel innerhalb von 15 Minuten bei Ihnen und klärt
          mit Ihnen die Schuldfrage. Danach sagen wir Ihnen genau, wie es weitergeht.
        </p>
      </div>
    )
  }

  return (
    <div className="py-4">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-ios-md bg-claimondo-ondo/10">
        <PhoneCallIcon className="h-6 w-6 text-claimondo-navy" />
      </div>

      <h2 className="text-heading-md font-semibold text-claimondo-navy mb-2">
        {vorname ? `${vorname}, die` : 'Die'} Schuldfrage klären wir persönlich
      </h2>
      <p className="text-body-sm text-claimondo-ondo mb-6 leading-relaxed">
        Wenn die Schuld nicht eindeutig ist, hängt viel davon ab, wie der Unfall genau abgelaufen ist.
        Statt jetzt einen Gutachter zu buchen, ruft Sie ein Berater an, klärt die Haftung mit Ihnen und
        leitet dann die richtigen Schritte ein.
      </p>

      {fehler && <p className="text-body-sm text-danger-strong mb-4">{fehler}</p>}

      <Button
        onClick={anfordern}
        loading={phase === 'sendet'}
        className="w-full"
        data-testid="rueckruf-anfordern"
      >
        Rückruf anfordern
      </Button>
    </div>
  )
}
