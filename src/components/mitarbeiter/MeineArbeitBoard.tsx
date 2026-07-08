'use client'

// KB-Cockpit Phase 1a: Work-State Board fuer /mitarbeiter
// Zeigt ClaimWorkItems in 3 Hauptphasen-Spalten. Die einzelne Karte (inkl. Hover-Edit)
// ist ausgelagert in @/components/ops/WorkItemCard (geteilt mit dem Admin-Cockpit).
// Spalten-Titel via MAIN_PHASE_LABEL.

import { MAIN_PHASE_LABEL, type ClaimMainPhase } from '@/lib/claims/lifecycle'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'
import WorkItemCard from '@/components/ops/WorkItemCard'

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
                  <WorkItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

