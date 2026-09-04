'use client'

// Re-Visit eines wegen Kasko-Werkstattbindung disqualifizierten Leads: statt der generischen KaskoEndansicht
// (Gutachter/Haftpflicht-Text) die Bindungs-Endseite mit Info aus der Wissensbasis.
// Abnahme 04.09.: "Angaben korrigieren" oeffnet die Tariffrage erneut; eine Antwort frei/unbekannt re-qualifiziert
// den Lead (speichereKaskoTarifFlow) — danach laedt die Seite neu und der Wizard laeuft normal weiter.
import { useEffect, useState } from 'react'
import { KaskoBindungEndansicht } from '@/components/self-service/KaskoBindungEndansicht'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { KaskoTarifFrage } from '@/components/self-service/KaskoTarifFrage'
import type { KaskoBindungsInfo, KaskoTarifAuswahl } from '@/lib/kasko-wb/types'
import { fordereRueckrufAn, ladeKaskoBindungsInfoFuerFlow, speichereKaskoTarifFlow } from './self-service-actions'

type Modus = 'ansicht' | 'korrigieren' | 'sende'

export function FlowKaskoBindungGate({ token }: { token: string }) {
  const [info, setInfo] = useState<KaskoBindungsInfo | null>(null)
  const [fehler, setFehler] = useState(false)
  const [modus, setModus] = useState<Modus>('ansicht')
  const [sendeFehler, setSendeFehler] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ladeKaskoBindungsInfoFuerFlow(token).then((r) => {
      if (!alive) return
      if (r.ok) setInfo(r.info)
      else setFehler(true)
    })
    return () => {
      alive = false
    }
  }, [token])

  async function korrigiere(auswahl: KaskoTarifAuswahl) {
    setModus('sende')
    setSendeFehler(null)
    const r = await speichereKaskoTarifFlow(token, auswahl)
    if (!r.ok) {
      setModus('korrigieren')
      setSendeFehler(r.error ?? 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.')
      return
    }
    if (r.ergebnis === 'abbruch') {
      if (r.info) setInfo(r.info)
      setModus('ansicht')
      return
    }
    // frei oder unbekannt: Lead ist re-qualifiziert -> der Wizard uebernimmt beim Neuladen.
    window.location.reload()
  }

  if (modus === 'korrigieren' || modus === 'sende') {
    return (
      <div className="max-w-md w-full">
        <KaskoTarifFrage onErgebnis={(auswahl) => void korrigiere(auswahl)} busy={modus === 'sende'} />
        {sendeFehler && <p className="mt-4 text-sm text-danger text-center">{sendeFehler}</p>}
      </div>
    )
  }
  // Ladefehler -> generische Endseite statt endlosem Laden.
  if (fehler) return <KaskoEndansicht />
  if (!info) return <p className="text-body-sm text-claimondo-navy/60">Wird geladen …</p>
  return <KaskoBindungEndansicht info={info} onRueckruf={() => fordereRueckrufAn(token)} onKorrigieren={() => setModus('korrigieren')} />
}
