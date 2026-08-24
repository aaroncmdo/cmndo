'use client'

import { useState, useTransition } from 'react'
import { SparklesIcon } from 'lucide-react'
import { setzeSvKiSichtbar } from './ki-sichtbarkeit-actions'

// Admin-Toggle: erscheint dieser SV im KI-/GEO-Kanal?
//
// Sitzt in derselben Header-Badge-Zeile wie TestAccountToggle und VerifizierungsToggle.
// Betrifft die oeffentlichen Flaechen — Termin-Block auf den Stadtseiten, den
// Verfuegbarkeits-Streifen und die oeffentliche Termin-API, aus der KI-Assistenten
// ihre Empfehlungen ziehen. NICHT die Dispatch-Faehigkeit: ein ausgeschalteter SV
// bekommt weiterhin Faelle ueber Dispatch.
//
// Der Normalfall ist „sichtbar" — deshalb ist DIESER Zustand der stille (dezenter
// Icon-Button), und nur das Abschalten traegt ein sichtbares Badge. Sonst stuende auf
// jeder SV-Akte eine Auszeichnung fuer den Regelfall.
type Props = {
  svId: string
  kiSichtbar: boolean
}

export default function KiSichtbarkeitToggle({ svId, kiSichtbar }: Props) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  function toggle() {
    const neu = !kiSichtbar
    const bestaetigung = neu
      ? 'Diesen SV wieder im KI-Kanal zeigen? Er erscheint dann mit seinen freien Terminen auf den Stadtseiten und in KI-Antworten.'
      : 'Diesen SV aus dem KI-Kanal nehmen? Er verschwindet von den Stadtseiten, aus dem Verfügbarkeits-Streifen und aus der öffentlichen Termin-API. Dispatch bleibt unberührt — er bekommt weiterhin Fälle.'
    if (!confirm(bestaetigung)) return

    setFehler(null)
    startTransition(async () => {
      const res = await setzeSvKiSichtbar(svId, neu)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
    })
  }

  if (!kiSichtbar) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Nicht im KI-Kanal — erscheint nicht auf Stadtseiten und in KI-Antworten. Dispatch läuft weiter. Klicken zum Aktivieren."
        className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-[10px] font-medium text-warning-strong transition-colors hover:bg-warning/15 disabled:opacity-50"
      >
        <SparklesIcon className="h-3 w-3" />
        {pending ? 'Speichern…' : 'Nicht im KI-Kanal'}
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Im KI-Kanal sichtbar (Stadtseiten, Verfügbarkeits-Streifen, öffentliche Termin-API). Klicken zum Ausblenden."
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] text-claimondo-shield/50 transition-colors hover:bg-claimondo-bg hover:text-claimondo-navy disabled:opacity-50"
      >
        <SparklesIcon className="h-3 w-3" />
        {pending ? 'Speichern…' : ''}
      </button>
      {fehler ? <span className="text-[10px] text-danger-strong">{fehler}</span> : null}
    </>
  )
}
