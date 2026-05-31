'use client'

// AAR-940 Phase 2: triggert die Promotion (Anfrage->Lead) beim Oeffnen des
// FlowLinks. Idempotent server-seitig; der useRef-Guard verhindert den
// StrictMode-Doppel-Effekt. Phase 3 (Selbst-Quali-Wizard) ersetzt den
// 'fertig'-Zustand.

import { useEffect, useRef, useState } from 'react'
import { promoteAnfrageZuLead } from './actions'

type Status = 'laeuft' | 'fertig' | 'fehler'

export function AnfrageStartClient({
  token,
  vorname,
  bereitsKonvertiert,
}: {
  token: string
  vorname: string | null
  bereitsKonvertiert: boolean
}) {
  const [status, setStatus] = useState<Status>(bereitsKonvertiert ? 'fertig' : 'laeuft')
  const [fehler, setFehler] = useState<string | null>(null)
  const gestartet = useRef(false)

  useEffect(() => {
    if (bereitsKonvertiert || gestartet.current) return
    gestartet.current = true
    promoteAnfrageZuLead(token)
      .then((r) => {
        if (r.ok) setStatus('fertig')
        else {
          setStatus('fehler')
          setFehler(r.error ?? 'Es ist ein Fehler aufgetreten.')
        }
      })
      .catch(() => {
        setStatus('fehler')
        setFehler('Es ist ein unerwarteter Fehler aufgetreten.')
      })
  }, [token, bereitsKonvertiert])

  const greet = vorname ? `Hallo ${vorname}` : 'Willkommen'

  return (
    <div className="max-w-md text-center">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">{greet}!</h1>
      {status === 'fehler' ? (
        <p className="text-claimondo-navy/70">{fehler}</p>
      ) : status === 'fertig' ? (
        <>
          <p className="text-claimondo-navy/80 mb-1">Ihr Vorgang ist gestartet.</p>
          <p className="text-claimondo-navy/60 text-sm">
            Es geht gleich weiter — wir prüfen Ihren Fall und Sie wählen Ihren Gutachter-Termin.
          </p>
        </>
      ) : (
        <p className="text-claimondo-navy/70">Einen Moment, wir starten Ihren Vorgang …</p>
      )}
    </div>
  )
}
