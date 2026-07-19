'use client'
import { TermineHub, type FallInfo } from '@/components/termine/TermineHub'
import type { KundeTerminEntry } from '@/lib/claims/kunde-termin-entries'

export type { FallInfo }

export default function KundeTermineClient({
  termine, fallMap,
}: {
  termine: KundeTerminEntry[]
  fallMap: Record<string, FallInfo>
}) {
  // Kunde-Link: SV-Termine (Besichtigung/Konfrontation) -> Termin-Detail-View;
  // Nachbesichtigung (synthetisch)/Beratung/Reparatur -> Fallakte.
  function linkFor(tr: KundeTerminEntry): string | null {
    if (tr.terminTyp === 'besichtigung' || tr.terminTyp === 'konfrontation') return `/kunde/termine/${tr.id}`
    const fall = (tr.fall_id ? fallMap[tr.fall_id] : undefined) ?? (tr.claim_id ? fallMap[tr.claim_id] : undefined)
    return fall ? `/kunde/faelle/${fall.claimId}` : null
  }
  return <TermineHub termine={termine} fallMap={fallMap} linkFor={linkFor} showActions />
}
