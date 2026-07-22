'use client'

// Mini-Aktionen-Zeile im Fahrzeug-Detail-Header. Karte identifizieren (Link) +
// „Gutachter finden": ruft den Gutachter-Finder auf und uebergibt in den kanonischen
// FlowLink. Die Schuld/Gegner-Auswahl (Haftpflicht vs. selbstverschuldet) passiert
// db-driven IM FlowLink (feststellung-steps: schuldfrage-Feld + conditional Gegner-Schritt)
// — daher KEINE separate FM-Abfrage hier. Kontext = Haftpflicht (vorbelegt, im FlowLink
// weiter editierbar). Existiert ein ersterfassung-Claim, wird er fortgesetzt; sonst neu.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'

export function FahrzeugMiniAktionen({
  vehicleId,
  fortsetzenClaimId,
  onMelden,
}: {
  vehicleId: string
  /** Bestehender ersterfassung-Claim → fortsetzen statt neu anlegen. */
  fortsetzenClaimId?: string | null
  /** Neuen Claim anlegen (wenn kein bestehender) → liefert claimId für den Gutachter-Finder. */
  onMelden: (
    vehicleId: string,
    haftungstyp: 'haftpflicht' | 'selbstverschuldet',
  ) => Promise<{ ok: true; claimId: string } | { ok: false; error: string }>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function gutachterFinden() {
    // Bestehender ersterfassung-Claim → direkt in den Gutachter-Finder (kein neuer Claim).
    if (fortsetzenClaimId) {
      router.push(`/flotte/schaden/${fortsetzenClaimId}/gutachter?typ=haftpflicht`)
      return
    }
    // Sonst neuen Claim anlegen → Gutachter-Finder. Haftpflicht = Vorbelegung (FlowLink editierbar).
    setBusy(true)
    setFehler(null)
    const res = await onMelden(vehicleId, 'haftpflicht')
    if (!res.ok) {
      setBusy(false)
      setFehler(res.error)
      return
    }
    router.push(`/flotte/schaden/${res.claimId}/gutachter?typ=haftpflicht`)
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
        <Button variant="ondo" size="sm" loading={busy} onClick={gutachterFinden}>
          Gutachter finden
        </Button>
      </div>
      {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
    </div>
  )
}
