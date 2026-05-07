'use client'

import { useState, useTransition } from 'react'
import { BadgeCheckIcon, ShieldOffIcon } from 'lucide-react'
import { setzeSvVerifiziert } from './actions'

// AAR-425: Admin-Toggle für den manuellen Verifizierungs-Status eines SVs.
// Sitzt in der Header-Badge-Zeile auf /admin/sachverstaendige/[id].
// Gate für Whitelabel-Sichtbarkeit auf der Kunden-Seite (siehe AAR-418-Epic).
type Props = {
  svId: string
  verifiziert: boolean
  verifiziertAm: string | null
}

export default function VerifizierungsToggle({ svId, verifiziert, verifiziertAm }: Props) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  function toggle() {
    const neu = !verifiziert
    const bestaetigung = neu
      ? 'Diesen SV als verifiziert markieren? Damit wird Whitelabeling auf der Kunden-Seite freigegeben.'
      : 'Verifizierung wirklich zurückziehen? Whitelabel-Features werden für diesen SV deaktiviert.'
    if (!confirm(bestaetigung)) return

    setFehler(null)
    startTransition(async () => {
      const res = await setzeSvVerifiziert(svId, neu)
      if (!res.success) setFehler(res.error ?? 'Unbekannter Fehler')
    })
  }

  const datum = verifiziertAm
    ? new Date(verifiziertAm).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit' })
    : null

  if (verifiziert) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={datum ? `Verifiziert seit ${datum} — klicken zum Zurückziehen` : 'Verifiziert — klicken zum Zurückziehen'}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
      >
        <BadgeCheckIcon className="w-3 h-3" />
        Verifiziert{datum ? ` · ${datum}` : ''}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Als verifiziert markieren — gibt Whitelabeling auf Kunden-Seite frei"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-claimondo-bg text-claimondo-ondo hover:bg-claimondo-border transition-colors disabled:opacity-50"
      >
        <ShieldOffIcon className="w-3 h-3" />
        {pending ? 'Speichern…' : 'Nicht verifiziert'}
      </button>
      {fehler && <span className="text-[10px] text-red-600">{fehler}</span>}
    </div>
  )
}
