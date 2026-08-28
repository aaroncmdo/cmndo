'use client'

// Spec 2026-07-21 (FlowLink operative Vollstaendigkeit) — werkstatt_anzeige-Step.
// Zeigt die bereits GEWAEHLTE Werkstatt an (Config-Bedingung {"reparatur_werkstatt_id": "$gesetzt"}),
// analog zum gutachter-Anzeige-Step. Der werkstatt-Picker faellt weg, sobald eine Werkstatt gesetzt
// ist ({"reparatur_werkstatt_id": null}); dieser Step uebernimmt dann die Anzeige. Rein informativ.

import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives/Button/Button.web'
import { ladeZugewieseneWerkstattFlow, type ZugewieseneWerkstatt } from './werkstatt-anzeige-actions'

export function FlowWerkstattAnzeige({ token, onWeiter }: { token: string; onWeiter: () => void }) {
  const [werkstatt, setWerkstatt] = useState<ZugewieseneWerkstatt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let aktiv = true
    void ladeZugewieseneWerkstattFlow(token).then((r) => {
      if (!aktiv) return
      if (r.ok) setWerkstatt(r.werkstatt)
      setLoading(false)
    })
    return () => {
      aktiv = false
    }
  }, [token])

  const adresse = werkstatt
    ? [werkstatt.adresse_strasse, [werkstatt.adresse_plz, werkstatt.adresse_ort].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
    : null

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-claimondo-navy">Ihre Werkstatt</h2>
        <p className="text-sm text-claimondo-ondo mt-1">
          Diese Werkstatt übernimmt die Reparatur Ihres Fahrzeugs.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-claimondo-ondo">Werkstatt wird geladen…</p>
      ) : werkstatt ? (
        <div className="rounded-ios-lg bg-claimondo-bg px-5 py-4">
          <p className="font-semibold text-claimondo-navy">{werkstatt.name}</p>
          {adresse && <p className="text-sm text-claimondo-ondo mt-0.5">{adresse}</p>}
          {werkstatt.telefon && <p className="text-sm text-claimondo-ondo mt-0.5">{werkstatt.telefon}</p>}
        </div>
      ) : (
        <p className="text-sm text-claimondo-ondo">Es ist noch keine Werkstatt hinterlegt.</p>
      )}

      <div className="flex justify-end">
        <Button onClick={onWeiter}>Weiter</Button>
      </div>
    </div>
  )
}
