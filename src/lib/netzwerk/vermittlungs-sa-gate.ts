// P4-UX-Followup (j03-Soll-Delta 04.08.): Der SV-Vermittlungs-Kunde startet im FlowLink
// DIREKT am Fokus-Signatur-Schritt — der SV hat Fall/Kunde/Gutachten komplett erfasst,
// Quali+Feststellung waeren ein Doppel-Ask (P4-Smoke-Befund, 2x dokumentiert).
// Pure Praedikat fuer den anonymen Zweig in /flow/[token]/page.tsx; der eingeloggte
// Fall laeuft weiter ueber den bestehenden kunde_id-Zweig.

import { istWerkstattReparaturWeg } from '@/lib/werkstatt/abrechnungsweg'

export function istAnonymerVermittlungsSaKandidat(row: {
  sourceChannel: string | null
  saUnterschrieben: boolean | null
  geschaedigterUserId: string | null
  abrechnungsweg: string | null
}): boolean {
  return (
    row.sourceChannel === 'gutachter-vermittlung' &&
    row.saUnterschrieben === false &&
    row.geschaedigterUserId === null &&
    !istWerkstattReparaturWeg(row.abrechnungsweg)
  )
}
