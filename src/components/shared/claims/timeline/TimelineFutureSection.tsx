// AAR-843: Future-Projection-Section ("voraussichtlich nächste Schritte")
//
// Aaron-Hinweis 3: prominent rendern, eigenes Card-Layout. Bei Endzustand
// (Phase 9_*) komplett ausgeblendet.

import { ClockIcon } from 'lucide-react'
import { getEventDisplay } from '../timeline-event-mappings'
import type { ProjectedEvent } from '@/lib/claims/timeline-projection'

type Props = {
  events: ProjectedEvent[]
  viewerRole: 'admin' | 'kb' | 'sv' | 'kunde'
}

export function TimelineFutureSection({ events, viewerRole }: Props) {
  if (events.length === 0) return null

  return (
    <div className="border border-[#E2E8F3] rounded-2xl bg-gradient-to-br from-[#0D1B3E]/[0.03] to-[#7BA3CC]/[0.05] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center">
          <ClockIcon className="w-4 h-4 text-claimondo-ondo" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-claimondo-navy">Voraussichtlich nächste Schritte</h3>
          <p className="text-[11px] text-claimondo-light-blue">Geschätzt — keine Garantie</p>
        </div>
      </div>

      <ul className="space-y-2 pl-2">
        {events.map((p, idx) => {
          const display = getEventDisplay(p.event_typ)
          const Icon    = display.icon
          const label   = viewerRole === 'kunde' ? p.labelKunde : p.labelInternal
          return (
            <li key={`${p.event_typ}-${idx}`} className="flex items-center gap-2 text-sm">
              <Icon className="w-4 h-4 text-claimondo-light-blue shrink-0" />
              <span className="text-claimondo-navy flex-1">{label}</span>
              <span className={`text-xs ${p.isRange ? 'text-claimondo-light-blue' : 'text-claimondo-ondo font-medium'}`}>
                {p.estimatedHorizon}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
