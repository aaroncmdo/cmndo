'use client'
import { TermineHub, type FallInfo } from '@/components/termine/TermineHub'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export default function FlotteTermineClient({
  termine,
  fallMap,
  vehicleByClaim,
}: {
  termine: KundeTerminEntry[]
  fallMap: Record<string, FallInfo>
  vehicleByClaim: Record<string, string>
}) {
  // Flotte-Link: Fahrzeug->Schaden-Detail (volle Rechte). Braucht vehicleId + claimId.
  function linkFor(tr: KundeTerminEntry): string | null {
    const claimId = tr.claim_id ?? (tr.fall_id ? fallMap[tr.fall_id]?.claimId : undefined) ?? null
    if (!claimId) return null
    const vehicleId = vehicleByClaim[claimId]
    return vehicleId ? `/flotte/fahrzeug/${vehicleId}/schaden/${claimId}` : null
  }
  return <TermineHub termine={termine} fallMap={fallMap} linkFor={linkFor} showActions />
}
