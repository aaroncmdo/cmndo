'use client'

// AAR-940 Phase 3: Selbst-Quali (Schuldfrage) als self-contained Step auf der
// Token-Strecke. Auto-Submit pro Option -> speichereQuali (service_role, Gate).
// Policy: nur Eigenverschulden -> kein Termin (fairer Hinweis). Sonst weiter.
// Phase 4 (Termin-Buchung via sv-matching-modul) ersetzt den 'weiter'-Zustand.

import { useState } from 'react'
import { speichereQuali } from './actions'
import { TerminBuchungClient } from './TerminBuchungClient'
import { QualiOptionen } from '@/components/self-service/QualiOptionen'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'

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
    return <KaskoEndansicht />
  }

  if (phase === 'weiter') {
    return <TerminBuchungClient token={token} />
  }

  if (phase === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler}</p>
      </div>
    )
  }

  return <QualiOptionen vorname={vorname} disabled={phase === 'sende'} onWaehle={waehle} />
}
