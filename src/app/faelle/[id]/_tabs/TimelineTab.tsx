// AAR-544 (C7): Timeline-Tab zeigt den unified Event-Stream aus 7 Quellen.
// Daten kommen aus page.tsx via getFallEventStream() — Component ist
// client-side nur für Filter-State und Modal.

import { EventTimeline } from '@/components/admin/fallakte/EventTimeline'
import type { FallEvent } from '@/lib/fall/event-stream'

export default function TimelineTab({ events }: { events: FallEvent[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-claimondo-navy">
          Timeline — alle Aktivitäten im Fall
        </h2>
        <span className="text-xs text-claimondo-ondo">{events.length} Events</span>
      </div>
      <EventTimeline events={events} />
    </div>
  )
}
