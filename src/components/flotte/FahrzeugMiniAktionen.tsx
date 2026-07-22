'use client'

// Mini-Aktionen-Zeile im Fahrzeug-Detail-Header.
// Karte identifizieren (Link) + „Schaden melden" (T5-3b): aktiv, sobald ein ersterfassung-
// Claim existiert → Haftpflicht/selbstverschuldet-Abfrage → Gutachter-Picker. Ohne Claim
// bleibt der Button ein Hinweis-Stub (Meldung läuft über die getappte Schadenkarte).
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/primitives'

export function FahrzeugMiniAktionen({ fortsetzenClaimId }: { fortsetzenClaimId?: string | null }) {
  const [wahlOffen, setWahlOffen] = useState(false)

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2 flex-wrap">
        {/* Karte identifizieren — navigiert zur Karten-Hub-Seite */}
        <Link href="/flotte/karten">
          <Button variant="ghost" size="sm">
            Karte identifizieren
          </Button>
        </Link>

        {fortsetzenClaimId ? (
          <Button variant="ondo" size="sm" onClick={() => setWahlOffen((v) => !v)}>
            Schaden melden
          </Button>
        ) : (
          <span title="Schaden über die getappte Schadenkarte melden">
            <Button variant="ghost" size="sm" disabled>
              Schaden melden
            </Button>
          </span>
        )}
      </div>

      {fortsetzenClaimId && wahlOffen && (
        <div className="space-y-2 rounded-ios-lg border border-claimondo-border p-3">
          <p className="text-body-sm text-claimondo-navy">Wer hat den Schaden verursacht?</p>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/flotte/schaden/${fortsetzenClaimId}/gutachter?typ=haftpflicht`}>
              <Button variant="navy" size="sm">
                Unfallgegner (Haftpflicht)
              </Button>
            </Link>
            <Link href={`/flotte/schaden/${fortsetzenClaimId}/gutachter?typ=selbstverschuldet`}>
              <Button variant="ghost" size="sm">
                Selbstverschuldet (Kasko)
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
