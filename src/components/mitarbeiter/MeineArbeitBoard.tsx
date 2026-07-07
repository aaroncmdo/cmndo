'use client'

// KB-Cockpit Phase 1a: Work-State Board fuer /mitarbeiter
// Zeigt ClaimWorkItems in 3 Hauptphasen-Spalten mit naechster-bester-Aktion + Ueberfaellig-Marker.
// Keine inline Status-/Farb-Maps (check:status-registry-konform) -- Farbe via FallPhaseBadge,
// Label via CLAIM_WORKFLOW_META, Spalten-Titel via MAIN_PHASE_LABEL.

import Link from 'next/link'
import { MAIN_PHASE_LABEL, type ClaimMainPhase } from '@/lib/claims/lifecycle'
import { CLAIM_WORKFLOW_META } from '@/lib/ops/claim-workflow-meta'
import FallPhaseBadge from '@/components/shared/FallPhaseBadge'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'

const AKTIVE_PHASEN: ClaimMainPhase[] = ['erfassung', 'begutachtung', 'regulierung']

/** Gruppiert Items nach Hauptphase, sortiert ueberfaellige zuerst. Exportiert fuer Tests. */
export function groupWorkItemsByPhase(
  items: ClaimWorkItem[],
): Record<ClaimMainPhase, ClaimWorkItem[]> {
  const result: Record<ClaimMainPhase, ClaimWorkItem[]> = {
    erfassung: [],
    begutachtung: [],
    regulierung: [],
    abschluss: [],
  }
  for (const item of items) {
    result[item.stage].push(item)
  }
  // Ueberfaellige zuerst innerhalb jeder Spalte
  for (const phase of AKTIVE_PHASEN) {
    result[phase].sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      return (b.overdueSinceDays ?? 0) - (a.overdueSinceDays ?? 0)
    })
  }
  return result
}

export default function MeineArbeitBoard({ items }: { items: ClaimWorkItem[] }) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-body-sm text-claimondo-ondo/70">
        Keine aktiven Fälle
      </p>
    )
  }

  const grouped = groupWorkItemsByPhase(items)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {AKTIVE_PHASEN.map((phase) => {
          const spalteItems = grouped[phase]
          return (
            <div
              key={phase}
              className="w-72 shrink-0 rounded-ios-xl border border-claimondo-border bg-white overflow-hidden flex flex-col"
            >
              {/* Spalten-Header */}
              <div className="px-3 py-2 border-b border-claimondo-border flex items-center justify-between bg-claimondo-bg">
                <p className="text-body-sm font-semibold text-claimondo-navy truncate">
                  {MAIN_PHASE_LABEL[phase]}
                </p>
                <span className="text-caption font-semibold text-claimondo-navy bg-white rounded-full px-2 py-0.5 border border-claimondo-border shrink-0">
                  {spalteItems.length}
                </span>
              </div>

              {/* Karten */}
              <div className="p-2 space-y-2 flex-1 min-h-[80px]">
                {spalteItems.length === 0 && (
                  <p className="text-caption text-claimondo-ondo/70 text-center py-4 italic">
                    Keine Fälle in dieser Phase
                  </p>
                )}
                {spalteItems.map((item) => (
                  <ArbeitCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ArbeitCard({ item }: { item: ClaimWorkItem }) {
  const href = item.fallId ? `/faelle/${item.fallId}` : null
  const meta = CLAIM_WORKFLOW_META[item.subState]

  const inner = (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-3 hover:border-claimondo-ondo hover:shadow-sm transition-all">
      {/* Titel + Kennzeichen */}
      <p className="text-body-sm font-semibold text-claimondo-navy truncate">
        {item.display.title}
      </p>
      {item.display.kennzeichen && (
        <p className="text-caption font-mono text-claimondo-ondo mt-0.5">
          {item.display.kennzeichen}
        </p>
      )}

      {/* Phase-Badge + Aktion */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <FallPhaseBadge subPhase={item.subState} size="sm" />
        <span className="text-caption px-1.5 py-0.5 rounded-ios-sm bg-claimondo-bg text-claimondo-ondo border border-claimondo-border">
          {meta.ctaLabel}
        </span>
      </div>

      {/* Ueberfaellig-Marker */}
      {item.isOverdue && item.overdueSinceDays != null && (
        <p className="mt-2 text-caption font-medium bg-warning-soft text-warning-strong rounded-ios-sm px-1.5 py-0.5 inline-block">
          ⏱ {item.overdueSinceDays} {item.overdueSinceDays === 1 ? 'Tag' : 'Tage'} überfällig
        </p>
      )}
    </div>
  )

  // Nur klickbar wenn fallId vorhanden — kein toter href='#'
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    )
  }
  return <div>{inner}</div>
}
