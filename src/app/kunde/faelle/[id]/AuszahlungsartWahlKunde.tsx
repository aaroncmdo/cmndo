'use client'

// Duenner Client-Wrapper: bindet die Kunden-Action an die gemeinsame Auswahl-Komponente.
// Getrennt vom SV-Wrapper, damit kein Bundle die jeweils fremde Action mitzieht.

import { AuszahlungsartWahl } from '@/components/shared/AuszahlungsartWahl'
import { aendereAuszahlungsartAlsKunde } from './actions'

export function AuszahlungsartWahlKunde({
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
      onWaehlen={(wert) => aendereAuszahlungsartAlsKunde(fallId, wert)}
    />
  )
}
