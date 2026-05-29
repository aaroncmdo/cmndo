// AAR-565 (B2): Timeline-Variant für V5 History-Drawer.
// Liest ausschließlich `reachedAt`-Timestamps + reachedBy, zeigt Subphasen
// bewusst NICHT (das soll die vertikale Variante im Detail-View).

import type { PhaseStepData } from './types'
import { PhaseStatusDot } from './PhaseStatusDot'

export function PhaseTimeline({
  phases,
}: {
  phases: PhaseStepData[]
}) {
  const events = phases.filter((p) => p.state !== 'hidden' && p.reachedAt)
  if (events.length === 0) {
    return (
      <p className="text-xs text-claimondo-ondo/70 italic px-3 py-4">
        Noch keine Phase abgeschlossen.
      </p>
    )
  }
  return (
    <ol className="relative space-y-3 pl-4">
      <span className="absolute left-1.5 top-2 bottom-2 w-px bg-claimondo-border" aria-hidden />
      {events.map((p) => (
        <li key={p.phase} className="relative">
          <span className="absolute -left-[11px] top-1">
            <PhaseStatusDot state={p.state} size="sm" />
          </span>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-claimondo-navy">
              <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 mr-1.5">
                Phase {p.phase.toString().padStart(2, '0')}
              </span>
              {p.name}
            </span>
            <time className="text-[11px] text-claimondo-ondo/70 shrink-0">
              {p.reachedAt
                ? new Date(p.reachedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
                : '—'}
            </time>
          </div>
          {p.reachedBy && (
            <p className="text-[11px] text-claimondo-ondo mt-0.5">durch {p.reachedBy}</p>
          )}
        </li>
      ))}
    </ol>
  )
}
