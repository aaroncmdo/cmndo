'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/primitives/Button'
import { sendeWinbackKampagne } from './actions'

const BATCH = 50

export function WinbackClient({ eligibleCount }: { eligibleCount: number }) {
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ gesendet: number; fehlgeschlagen: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const batch = Math.min(eligibleCount, BATCH)

  function handleSend() {
    setError(null)
    startTransition(async () => {
      const res = await sendeWinbackKampagne()
      setConfirming(false)
      if (!res.ok) {
        setError(res.error ?? 'Versand fehlgeschlagen')
        return
      }
      setResult({ gesendet: res.gesendet, fehlgeschlagen: res.fehlgeschlagen })
    })
  }

  return (
    <div className="space-y-3">
      {result && (
        <div className="rounded-ios-md bg-success-soft px-4 py-3 text-body-sm text-success-strong">
          {result.gesendet} Reaktivierungs-Mail(s) gesendet
          {result.fehlgeschlagen > 0 ? `, ${result.fehlgeschlagen} fehlgeschlagen` : ''}. Seite neu
          laden für den verbleibenden Zähler.
        </div>
      )}
      {error && (
        <div className="rounded-ios-md bg-danger-soft px-4 py-3 text-body-sm text-danger-strong">{error}</div>
      )}

      {eligibleCount === 0 ? (
        <p className="text-body-sm text-claimondo-ondo">Aktuell keine reaktivierbaren Leads in der Kohorte.</p>
      ) : !confirming ? (
        <Button variant="navy" onClick={() => setConfirming(true)} loading={pending}>
          Kampagne senden (bis zu {batch} pro Klick)
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm text-claimondo-ondo">
            Wirklich Reaktivierungs-Mails an bis zu {batch} Leads senden?
          </span>
          <Button variant="navy" onClick={handleSend} loading={pending}>
            Ja, senden
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Abbrechen
          </Button>
        </div>
      )}
    </div>
  )
}
