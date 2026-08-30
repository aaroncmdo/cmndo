'use client'

// Duenner Client-Wrapper: bindet die SV-Action an die gemeinsame Auswahl-Komponente.
// Getrennt vom Kunden-Wrapper, damit das Kunden-Bundle die SV-Action nicht mitzieht.

import { AuszahlungsartWahl } from '@/components/shared/AuszahlungsartWahl'
import { aendereAuszahlungsartAlsSv } from './actions'

export function AuszahlungsartWahlSv({
  fallId,
  aktuell,
  gesperrt,
  gesperrtSeit,
}: {
  fallId: string
  aktuell: string | null
  gesperrt: boolean
  gesperrtSeit?: string | null
}) {
  return (
    <AuszahlungsartWahl
      aktuell={aktuell}
      gesperrt={gesperrt}
      gesperrtSeit={gesperrtSeit}
      onWaehlen={(wert) => aendereAuszahlungsartAlsSv(fallId, wert)}
    />
  )
}
