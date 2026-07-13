'use client'

// Mini-Aktionen-Zeile im Fahrzeug-Detail-Header.
// Zwei Aktionen: Karte identifizieren (Link) + Schaden melden (disabled-Stub, Slice 2).

import Link from 'next/link'
import { Button } from '@/components/primitives'

export function FahrzeugMiniAktionen() {
  return (
    <div className="flex gap-2 flex-wrap mt-3">
      {/* Karte identifizieren — navigiert zur Karten-Hub-Seite */}
      <Link href="/flotte/karten">
        <Button variant="ghost" size="sm">
          Karte identifizieren
        </Button>
      </Link>

      {/* Schaden melden — Placeholder, wird mit Gegner-Flow (Slice 2) aktiviert.
          title auf dem span-Wrapper: primitives/Button hat kein title-Prop. */}
      <span title="Kommt mit dem Gegner-Flow (Slice 2)">
        <Button variant="ghost" size="sm" disabled>
          Schaden melden
        </Button>
      </span>
    </div>
  )
}
