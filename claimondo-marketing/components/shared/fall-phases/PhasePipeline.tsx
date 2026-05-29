// AAR-565 (B2): Hauptkomponente — orchestriert die Phase-Darstellung.
// Dispatcht auf die passende Variante (horizontal/vertical/compact/timeline).
// Keine Domain-Logik — nur Layout + Delegation an die Kind-Komponenten.

import type { PhasePipelineProps } from './types'
import { PhaseStep } from './PhaseStep'
import { SubphaseStepper } from './SubphaseStepper'
import { PhaseTimeline } from './PhaseTimeline'

export function PhasePipeline({
  fall,
  rolle,
  phases,
  variant = 'vertical',
  onPhaseClick,
  showTimestamps,
  className,
}: PhasePipelineProps) {
  if (variant === 'timeline') {
    return (
      <section
        className={`w-full ${className ?? ''}`}
        aria-label="Phasen-Verlauf"
        data-rolle={rolle}
        data-fall={fall.id}
      >
        <PhaseTimeline phases={phases} />
      </section>
    )
  }

  if (variant === 'horizontal') {
    return (
      <section
        className={`flex items-start gap-1 overflow-x-auto md:overflow-visible w-full ${className ?? ''}`}
        aria-label="Phasen-Fortschritt"
        data-rolle={rolle}
        data-fall={fall.id}
      >
        {phases
          .filter((p) => p.state !== 'hidden')
          .map((p) => (
            <div key={p.phase} className="flex-1 min-w-[7rem] md:min-w-0">
              <PhaseStep
                data={p}
                variant="horizontal"
                onClick={onPhaseClick}
                showTimestamps={showTimestamps}
              />
            </div>
          ))}
      </section>
    )
  }

  if (variant === 'compact') {
    return (
      <section
        className={`flex flex-col gap-0.5 ${className ?? ''}`}
        aria-label="Phasen-Fortschritt (kompakt)"
        data-rolle={rolle}
        data-fall={fall.id}
      >
        {phases
          .filter((p) => p.state !== 'hidden')
          .map((p) => (
            <PhaseStep
              key={p.phase}
              data={p}
              variant="compact"
              onClick={onPhaseClick}
              showTimestamps={showTimestamps}
            />
          ))}
      </section>
    )
  }

  const visiblePhases = phases.filter((p) => p.state !== 'hidden')
  return (
    <section
      className={`flex flex-col ${className ?? ''}`}
      aria-label="Phasen-Fortschritt"
      data-rolle={rolle}
      data-fall={fall.id}
    >
      {visiblePhases.map((p, idx) => (
        <div key={p.phase} className="relative">
          <PhaseStep
            data={p}
            variant="vertical"
            onClick={onPhaseClick}
            showTimestamps={showTimestamps}
            isLast={idx === visiblePhases.length - 1}
          />
          {p.subphases && p.subphases.length > 0 && p.state !== 'upcoming' && (
            <SubphaseStepper subphases={p.subphases} showTimestamps={showTimestamps} />
          )}
        </div>
      ))}
    </section>
  )
}
