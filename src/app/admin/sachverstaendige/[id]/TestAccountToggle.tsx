'use client'

import { useState, useTransition } from 'react'
import { FlaskConicalIcon } from 'lucide-react'
import { setzeSvTestaccount } from './test-account-actions'

// Gutachter-Onboarding-Audit (Befund #6): Admin-Toggle für das ist_testaccount-Flag.
// Sitzt in der Header-Badge-Zeile auf /admin/sachverstaendige/[id], analog zum
// VerifizierungsToggle. Ein markierter Test-Account faellt aus Karte, Dispatch/MCP
// und dem LP-Region-Count.
type Props = {
  svId: string
  istTestaccount: boolean
}

export default function TestAccountToggle({ svId, istTestaccount }: Props) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  function toggle() {
    const neu = !istTestaccount
    const bestaetigung = neu
      ? 'Diesen SV als internen Test-Account markieren? Er verschwindet dann von der öffentlichen Karte, aus Dispatch/MCP und dem Region-Count.'
      : 'Test-Markierung entfernen? Der SV wird wieder normal behandelt (Karte/Dispatch, sofern verifiziert + aktiv).'
    if (!confirm(bestaetigung)) return

    setFehler(null)
    startTransition(async () => {
      const res = await setzeSvTestaccount(svId, neu)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
    })
  }

  if (istTestaccount) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Interner Test-Account — nicht auf Karte/Dispatch/MCP. Klicken zum Aufheben."
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-warning-soft text-warning-strong hover:bg-warning/15 transition-colors disabled:opacity-50"
      >
        <FlaskConicalIcon className="w-3 h-3" />
        {pending ? 'Speichern…' : 'Test-Account'}
      </button>
    )
  }

  // Nicht-Test: dezenter Icon-Button (kein Text) — haelt die Header-Zeile ruhig.
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Als internen Test-Account markieren (entfernt von Karte/Dispatch/MCP)"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-claimondo-ondo/40 hover:text-claimondo-ondo hover:bg-claimondo-bg transition-colors disabled:opacity-50"
      >
        <FlaskConicalIcon className="w-3 h-3" />
      </button>
      {fehler && <span className="text-[10px] text-danger">{fehler}</span>}
    </div>
  )
}
