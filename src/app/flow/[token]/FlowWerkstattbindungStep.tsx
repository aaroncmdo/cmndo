'use client'

// Spec 2026-07-21 (FlowLink operative Vollstaendigkeit) — Kasko-Werkstattbindungs-Gate.
// Ein Kasko-Kunde muss aktiv bestaetigen, dass seine Police KEINE Werkstatt vorschreibt und er
// frei waehlen darf, BEVOR die Werkstatt-Strecke laeuft. Die Quali-Phase 'werkstattbindung'
// (FlowQualiStep) fragt das schon — aber ein vor-klassifizierter Kasko-Lead ueberspringt die Quali,
// darum dieser eigene Step (Config-Bedingung {"freie_werkstattwahl": null}).
//
// Reuse statt neuer Action: speichereQualiFlow(kasko, frei) setzt freie_werkstattwahl UND bringt die
// Werkstattbindungs-Disqualifikation (disqualifikationsGrundKey='werkstattbindung') gratis mit
// (quali-flow-outcome.ts). "frei" -> ergebnis 'weiter' -> naechster Step; "gebunden" -> 'abbruch'.

import { useState } from 'react'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { speichereQualiFlow } from './self-service-actions'

type Phase = 'frage' | 'sende' | 'abbruch' | 'fehler'

export function FlowWerkstattbindungStep({ token, onWeiter }: { token: string; onWeiter: () => void }) {
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

  async function bestaetige(freieWerkstattwahl: boolean) {
    setPhase('sende')
    setFehler(null)
    try {
      // Der Lead ist bereits Kasko (schuldfrage=eigenverantwortung, eigene_versicherung=ja) — die
      // Werte werden idempotent mitgesetzt; entscheidend ist freie_werkstattwahl.
      const r = await speichereQualiFlow(token, 'eigenverantwortung', true, freieWerkstattwahl)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.')
        return
      }
      // Kasko-gebunden -> abbruch (KaskoEndansicht); freie Wahl -> weiter zur Werkstatt.
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      onWeiter()
    } catch {
      setPhase('fehler')
      setFehler('Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.')
    }
  }

  if (phase === 'abbruch') return <KaskoEndansicht />

  return (
    <div className="max-w-md w-full">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
        Dürfen Sie die Werkstatt frei wählen?
      </h1>
      <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
        Manche Kasko-Tarife schreiben eine Partnerwerkstatt vor. Wenn Sie frei wählen dürfen, finden
        wir Ihnen eine passende Werkstatt für die Reparatur.
      </p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={phase === 'sende'}
          data-testid="werkstattbindung-frei"
          onClick={() => void bestaetige(true)}
          className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo disabled:opacity-60"
        >
          <span className="block font-semibold text-claimondo-navy">Ja, ich kann die Werkstatt frei wählen</span>
          <span className="block text-sm text-claimondo-navy/60">
            Meine Police schreibt keine bestimmte Werkstatt vor.
          </span>
        </button>
        <button
          type="button"
          disabled={phase === 'sende'}
          data-testid="werkstattbindung-gebunden"
          onClick={() => void bestaetige(false)}
          className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo disabled:opacity-60"
        >
          <span className="block font-semibold text-claimondo-navy">Nein, meine Versicherung schreibt die Werkstatt vor</span>
          <span className="block text-sm text-claimondo-navy/60">
            Dann wenden Sie sich bitte direkt an Ihre Kaskoversicherung.
          </span>
        </button>
      </div>
      {fehler && <p className="mt-4 text-sm text-danger text-center">{fehler}</p>}
    </div>
  )
}
