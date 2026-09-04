'use client'

// Kasko-Werkstattbindungs-Gate (Spec 2026-07-21 -> 2026-09-04 Phase 1): statt der binaeren Selbstauskunft
// fragt der Step Versicherer + Tarif (KaskoTarifFrage) und leitet die Bindung aus der Wissensbasis ab.
// Config-Bedingung {"freie_werkstattwahl": null, "werkstattbindung_quelle": null} (Mig 3). Ergebnisse:
//   frei      -> onWeiter (Werkstatt-Strecke)
//   gebunden  -> KaskoBindungEndansicht (ehrlich: Marke, Sanktion, Versicherer-Kontakt, Rueckruf)
//   unbekannt -> KaskoUnklarHinweis, dann onWeiter (E3: durchlassen, Dispatch klaert)

import { useState } from 'react'
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import { KaskoUnklarHinweis } from '@/components/self-service/KaskoUnklarHinweis'
import type { KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { speichereKaskoTarifFlow } from './self-service-actions'

type Phase = 'frage' | 'sende' | 'unklar' | 'fehler'

export function FlowWerkstattbindungStep({ token, onWeiter }: { token: string; onWeiter: () => void }) {
  const [phase, setPhase] = useState<Phase>('frage')
  const [markeName, setMarkeName] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichere(auswahl: KaskoTarifAuswahl) {
    setPhase('sende')
    setFehler(null)
    setMarkeName(auswahl.markeName)
    try {
      const r = await speichereKaskoTarifFlow(token, auswahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.')
        return
      }
      if (r.ergebnis === 'abbruch') {
        // Abnahme 04.09.: Endseite OHNE Wizard-Schrittanzeige — nach dem Neuladen rendert das Re-Visit-Gate
        // (FlowKaskoBindungGate) die Bindungs-Endseite ohne "Schritt 2 von n".
        window.location.reload()
        return
      }
      if (r.ergebnis === 'unklar') {
        setPhase('unklar')
        return
      }
      onWeiter()
    } catch {
      setPhase('fehler')
      setFehler('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')
    }
  }

  if (phase === 'unklar') {
    return <KaskoUnklarHinweis markeName={markeName} onWeiter={onWeiter} />
  }

  return (
    <div className="max-w-md w-full">
      <KaskoTarifFrage onErgebnis={(auswahl) => void speichere(auswahl)} busy={phase === 'sende'} />
      {phase === 'fehler' && fehler && <p className="mt-4 text-sm text-danger text-center">{fehler}</p>}
    </div>
  )
}
