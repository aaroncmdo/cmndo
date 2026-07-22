'use client'

// Mini-Aktionen-Zeile im Fahrzeug-Detail-Header.
// Karte identifizieren (Link) + „Schaden melden" (T5-3b / FU3): Haftpflicht/selbstverschuldet-
// Abfrage → Gutachter-Picker. Existiert ein ersterfassung-Claim, wird dieser fortgesetzt;
// sonst wird ein neuer Claim angelegt (v.a. selbstverschuldet — kein Gegner-Tap-Flow).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'

type Haftungstyp = 'haftpflicht' | 'selbstverschuldet'

export function FahrzeugMiniAktionen({
  vehicleId,
  fortsetzenClaimId,
  onMelden,
}: {
  vehicleId: string
  /** T5-3a/3b: bestehender ersterfassung-Claim → fortsetzen statt neu anlegen. */
  fortsetzenClaimId?: string | null
  /** FU3: neuen Claim anlegen (wenn kein bestehender) → liefert claimId für den Picker. */
  onMelden: (
    vehicleId: string,
    haftungstyp: Haftungstyp,
  ) => Promise<{ ok: true; claimId: string } | { ok: false; error: string }>
}) {
  const router = useRouter()
  const [wahlOffen, setWahlOffen] = useState(false)
  const [busy, setBusy] = useState<Haftungstyp | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function melden(haftungstyp: Haftungstyp) {
    // Bestehender ersterfassung-Claim → direkt in den Picker (kein neuer Claim).
    if (fortsetzenClaimId) {
      router.push(`/flotte/schaden/${fortsetzenClaimId}/gutachter?typ=${haftungstyp}`)
      return
    }
    // Sonst neuen Claim anlegen (v.a. selbstverschuldet) → Picker.
    setBusy(haftungstyp)
    setFehler(null)
    const res = await onMelden(vehicleId, haftungstyp)
    if (!res.ok) {
      setBusy(null)
      setFehler(res.error)
      return
    }
    router.push(`/flotte/schaden/${res.claimId}/gutachter?typ=${haftungstyp}`)
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
        <Button variant="ondo" size="sm" onClick={() => setWahlOffen((v) => !v)}>
          Schaden melden
        </Button>
      </div>

      {wahlOffen && (
        <div className="space-y-2 rounded-ios-lg border border-claimondo-border p-3">
          <p className="text-body-sm text-claimondo-navy">Wer hat den Schaden verursacht?</p>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="navy"
              size="sm"
              loading={busy === 'haftpflicht'}
              disabled={busy !== null}
              onClick={() => melden('haftpflicht')}
            >
              Unfallgegner (Haftpflicht)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={busy === 'selbstverschuldet'}
              disabled={busy !== null}
              onClick={() => melden('selbstverschuldet')}
            >
              Selbstverschuldet (Kasko)
            </Button>
          </div>
          {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
        </div>
      )}
    </div>
  )
}
