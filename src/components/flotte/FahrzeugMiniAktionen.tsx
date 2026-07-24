'use client'

// Mini-Aktionen-Zeile im Fahrzeug-Detail-Header. „Karte identifizieren" (Link) + „Schaden melden".
// Lead-first (Aaron 23.07.): „Schaden melden" erzeugt IMMER einen neuen Lead + FlowLink (ein
// Fahrzeug hat ueber die Zeit mehrere Vorfaelle) und navigiert auf /flow/[token]. Die Haftpflicht/
// Kasko-Weiche faellt db-driven IM FlowLink (quali-Step) — daher KEINE Vorab-Abfrage hier und KEIN
// Fortsetzen bestehender Claims (das lebt im Claim-Detail „Schaden vervollständigen", nicht am Header).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'

export function FahrzeugMiniAktionen({
  vehicleId,
  onMelden,
}: {
  vehicleId: string
  /** Erzeugt einen baren Lead + FlowLink → liefert den Token fuer /flow. */
  onMelden: (vehicleId: string) => Promise<{ ok: true; token: string } | { ok: false; error: string }>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function schadenMelden() {
    setBusy(true)
    setFehler(null)
    const res = await onMelden(vehicleId)
    if (!res.ok) {
      setBusy(false)
      setFehler(res.error)
      return
    }
    router.push(`/flow/${res.token}`)
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2 flex-wrap">
        {/* Karte identifizieren — navigiert zur Karten-Hub-Seite */}
        <Link href="/flotte/karten">
          <Button variant="ghost" size="sm">
            Karte identifizieren
          </Button>
        </Link>
        <Button variant="ondo" size="sm" loading={busy} onClick={schadenMelden}>
          Schaden melden
        </Button>
      </div>
      {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
    </div>
  )
}
