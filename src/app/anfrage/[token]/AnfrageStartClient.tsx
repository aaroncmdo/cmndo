'use client'

// AAR-940 Phase 2+3: triggert die Promotion (Anfrage->Lead) beim Oeffnen des
// FlowLinks (idempotent, useRef-Guard gegen StrictMode-Doppel-Effekt) und
// uebergibt nach Erfolg an die Selbst-Quali (Phase 3). Phase 4 (Termin-Buchung)
// haengt sich hinter der Quali ein.

import { useEffect, useRef, useState } from 'react'
import { promoteAnfrageZuLead } from './actions'
import { SelbstQualiClient } from './SelbstQualiClient'

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

  if (status === 'fertig') {
    return <SelbstQualiClient token={token} vorname={vorname} />
  }

  if (status === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler}</p>
      </div>
    )
  }

  return (
    <div className="max-w-md text-center">
      <p className="text-claimondo-navy/70">Einen Moment, wir starten Ihren Vorgang …</p>
    </div>
  )
}
