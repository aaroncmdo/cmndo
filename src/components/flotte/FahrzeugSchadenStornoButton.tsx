'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'

/**
 * Inline-Storno fuer einen frueh-stufigen Fahrzeug-Schaden (Flottenmanager).
 * Sichtbar nur, wenn der Server (fmDarfStornieren) den Schaden freigibt; die
 * eigentliche Storno-Action laeuft ueber die State-Machine-Engine.
 */
export function FahrzeugSchadenStornoButton({
  claimId,
  vehicleId,
  onStorno,
}: {
  claimId: string
  vehicleId: string
  onStorno: (
    claimId: string,
    vehicleId: string,
    grund: string,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [offen, setOffen] = useState(false)
  const [grund, setGrund] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function bestaetige() {
    if (!grund.trim()) {
      setFehler('Bitte einen Grund angeben.')
      return
    }
    setBusy(true)
    setFehler(null)
    const res = await onStorno(claimId, vehicleId, grund.trim())
    setBusy(false)
    if (res.ok) {
      setOffen(false)
      setGrund('')
      router.refresh()
    } else {
      setFehler(res.error ?? 'Storno fehlgeschlagen.')
    }
  }

  if (!offen) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOffen(true)}>
        Stornieren
      </Button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
      <p className="text-body-xs text-claimondo-ondo">
        Diesen Schaden stornieren? Bitte geben Sie einen kurzen Grund an (z.&nbsp;B. „versehentlich
        angelegt").
      </p>
      <input
        value={grund}
        onChange={(e) => setGrund(e.target.value)}
        placeholder="Grund"
        className="w-full rounded-ios-sm border border-claimondo-border bg-white px-2 py-1 text-body-sm text-claimondo-navy"
      />
      {fehler && <p className="text-body-xs text-danger-strong">{fehler}</p>}
      <div className="flex gap-2">
        <Button variant="ondo" size="sm" loading={busy} onClick={bestaetige}>
          Storno bestätigen
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setOffen(false)
            setFehler(null)
          }}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  )
}
