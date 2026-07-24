'use client'

// §2d „Schaden vervollständigen" (Claim-Detail): setzt einen bestehenden Claim (Gegner-Tap oder
// frueher gemeldet) db-driven ueber /flow fort. Ruft die FM-gegatete Action → FlowLink-Token →
// navigiert auf /flow/[token]. Ersetzt den frueheren Gutachter-Picker-Link (der haftpflicht-
// spezifisch war) — die Haftpflicht/Kasko-Weiche faellt jetzt db-driven im /flow (quali-Step).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { meldeSchadenVervollstaendigen } from '@/app/flotte/(shell)/fahrzeug/[id]/actions'

export function SchadenVervollstaendigenButton({ claimId }: { claimId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function fortsetzen() {
    setBusy(true)
    setFehler(null)
    const res = await meldeSchadenVervollstaendigen(claimId)
    if (!res.ok) {
      setBusy(false)
      setFehler(res.error)
      return
    }
    router.push(`/flow/${res.token}`)
  }

  return (
    <div className="mt-3">
      <Button variant="ondo" size="sm" loading={busy} onClick={fortsetzen}>
        Schaden vervollständigen
      </Button>
      {fehler && <p className="mt-1 text-caption text-danger-strong">{fehler}</p>}
    </div>
  )
}
