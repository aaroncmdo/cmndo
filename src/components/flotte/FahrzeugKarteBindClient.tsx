'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SchadenkarteScanner } from '@/components/flotte/SchadenkarteScanner'

/**
 * Bind-Widget auf der Fahrzeug-Detailseite, wenn das Fahrzeug noch KEINE
 * gebundene Karte hat. QR-Scan (Kamera) oder manuelle Token-Eingabe ueber
 * SchadenkarteScanner; der NFC-Tap-Weg laeuft device-agnostisch ueber
 * /schaden/[token]. `onBind` ist eine flottenmanager-gescopte Server-Action.
 */
export function FahrzeugKarteBindClient({
  vehicleId,
  onBind,
}: {
  vehicleId: string
  onBind: (token: string, vehicleId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function handleToken(token: string) {
    setBusy(true)
    setFehler(null)
    const res = await onBind(token, vehicleId)
    setBusy(false)
    if (res.ok) {
      router.refresh()
    } else {
      setFehler(res.error ?? 'Binden fehlgeschlagen.')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-claimondo-shield">
        Noch keine Karte gebunden. Scannen Sie den QR-Code der Netzwerkkarte — oder tippen Sie die
        Karte mit dem Handy an — um sie diesem Fahrzeug zuzuweisen.
      </p>
      <SchadenkarteScanner onToken={handleToken} disabled={busy} />
      {fehler && <p className="text-sm text-danger-strong">{fehler}</p>}
    </div>
  )
}
