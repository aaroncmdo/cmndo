// AAR-843: TimelineView — Container für Future-Section + Vergangenheits-Verlauf
//
// Layout A laut Aaron-Hinweis 2: Future-Section oben, dann chronologische
// Liste der Events absteigend (neueste zuerst).
//
// Variants:
//   'full'    — eigener Tab "Verlauf" in der Akte
//   'compact' — Sidebar-Liste mit Limit (default 5 Events)

import { TimelineEventCard } from './TimelineEventCard'
import { TimelineFutureSection } from './TimelineFutureSection'
import type { ClaimTimelineEvent } from '@/lib/claims/timeline-queries'
import type { ProjectedEvent } from '@/lib/claims/timeline-projection'

type Props = {
  events: ClaimTimelineEvent[]
  futureEvents: ProjectedEvent[]
  viewerRole: 'admin' | 'kb' | 'sv' | 'kunde'
  variant?: 'full' | 'compact'
  showKategorieBadge?: boolean
  /** Bei compact: Link auf den Verlaufs-Tab */
  fullTabHref?: string
}

export function TimelineView({
  events,
  futureEvents,
  viewerRole,
  variant = 'full',
  showKategorieBadge = false,
  fullTabHref,
}: Props) {
  if (variant === 'compact') {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-[#7BA3CC] uppercase tracking-wide">Verlauf</h3>
          {fullTabHref && (
            <a href={fullTabHref} className="text-[11px] text-[#4573A2] hover:underline">Alle anzeigen →</a>
          )}
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-[#7BA3CC] py-3">Noch keine Events erfasst</p>
        ) : (
          <div className="border border-[#E2E8F3] rounded-xl bg-white px-3">
            {events.map((e) => (
              <TimelineEventCard key={e.event_id} event={e} viewerRole={viewerRole} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Future-Projection: prominent oben */}
      <TimelineFutureSection events={futureEvents} viewerRole={viewerRole} />

      {/* Vergangenheits-Verlauf */}
      <div>
        <h3 className="text-sm font-semibold text-[#0D1B3E] mb-2">Bisheriger Verlauf</h3>
        {events.length === 0 ? (
          <div className="border-2 border-dashed border-[#E2E8F3] rounded-xl py-10 text-center text-sm text-[#7BA3CC]">
            Noch keine Events im Verlauf
          </div>
        ) : (
          <div className="border border-[#E2E8F3] rounded-xl bg-white px-4">
            {events.map((e) => (
              <TimelineEventCard
                key={e.event_id}
                event={e}
                viewerRole={viewerRole}
                showKategorieBadge={showKategorieBadge}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
