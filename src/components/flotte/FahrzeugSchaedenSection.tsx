// Fahrzeug-Schaeden-Sektion — zeigt Claims + Draft-Leads eines Fahrzeugs.
// SERVER component (kein 'use client'). Rein praesentation — kein fetch, kein state.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import type { FahrzeugSchaeden, ClaimMini, DraftMini } from '@/lib/flotte/fahrzeug-schaeden'

// Pill-Label fuer Draft-Leads (kein Status-Registry-Code — fester Text).
const DraftPill = () => (
  <span className="bg-warning-soft text-warning-strong rounded-ios-sm px-2 py-0.5 text-body-xs shrink-0">
    In Bearbeitung
  </span>
)

// Datum-Hilfsfunktion — identisches Pattern wie in den Fahrzeug-Detail-Pages.
function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type Props = {
  schaeden: FahrzeugSchaeden
  vehicleId: string
}

export function FahrzeugSchaedenSection({ schaeden, vehicleId }: Props) {
  const { claims, drafts } = schaeden
  const hasEntries = claims.length > 0 || drafts.length > 0

  return (
    <SectionCard title="Schäden">
      {!hasEntries ? (
        <EmptyState
          title="Noch keine Schäden erfasst"
          description="Noch keine Schäden für dieses Fahrzeug erfasst."
          variant="compact"
        />
      ) : (
        <ul className="divide-y divide-claimondo-border">
          {/* Drafts zuerst — kein StatusBadge, da lead-workflow die raw-Status-Codes
              (quali-offen/flow-gesendet) nicht abdeckt; stattdessen fester Text-Pill. */}
          {drafts.map((d: DraftMini) => (
            <li key={d.leadId} className="flex items-center gap-3 py-3">
              <DraftPill />
              <span className="flex-1 min-w-0 text-sm text-claimondo-navy truncate">
                Schaden-Entwurf
              </span>
              <span className="text-body-xs text-claimondo-shield shrink-0">
                {formatDatum(d.createdAt)}
              </span>
            </li>
          ))}

          {/* Claims — mit Link zur Schaden-Detail-Route (Task 5) */}
          {claims.map((c: ClaimMini) => (
            <li key={c.claimId}>
              <Link
                href={`/flotte/fahrzeug/${vehicleId}/schaden/${c.claimId}`}
                className="flex items-center gap-3 py-3 rounded-ios-sm hover:bg-claimondo-bg transition-colors group"
              >
                <StatusBadge domain="claims-status" code={c.status} />
                <span className="flex-1 min-w-0 text-sm font-medium text-claimondo-navy truncate">
                  {c.claimNummer ?? '—'}
                </span>
                <span className="text-xs text-claimondo-shield shrink-0">
                  {formatDatum(c.schadentag)}
                </span>
                {c.schadensHoeheNetto != null && (
                  <span className="text-xs font-medium text-claimondo-navy shrink-0">
                    {c.schadensHoeheNetto.toLocaleString('de-DE', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </span>
                )}
                <ChevronRight
                  className="w-4 h-4 text-claimondo-shield shrink-0 group-hover:text-claimondo-navy transition-colors"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
