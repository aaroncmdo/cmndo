'use client'

import { useState } from 'react'
import { ChevronRightIcon, CheckIcon } from 'lucide-react'
import type { Phase, Progress } from './stepperConfig'

export default function ScenarioStepper({ phasen, progress }: { phasen: Phase[]; progress: Progress }) {
  // Regel 13: State initialisieren — aktuelle Phase by default ausgeklappt
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([progress.phase]))

  function toggle(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="flex flex-col">
      {phasen.map((phase, pi) => {
        const isLast = pi === phasen.length - 1
        const phaseComplete = pi < progress.phase
        const phaseCurrent = pi === progress.phase
        const phaseFuture = pi > progress.phase
        const isExpanded = expanded.has(pi)

        // Punkt-Farben
        const dotColor = phaseComplete
          ? 'bg-green-500'
          : phaseCurrent
            ? 'bg-[#4573A2] animate-pulse'
            : 'bg-gray-200'

        // Text-Farben
        const textColor = phaseComplete
          ? 'text-green-600'
          : phaseCurrent
            ? 'text-[#0D1B3E] font-semibold'
            : 'text-gray-400'

        // Linien-Farbe
        const lineColor = phaseComplete ? 'bg-green-300' : 'bg-gray-200'

        return (
          <div key={phase.key}>
            {/* Hauptphase — klickbar */}
            <button
              type="button"
              onClick={() => toggle(pi)}
              className="flex items-center gap-3 w-full text-left py-1.5 hover:bg-gray-50/50 rounded-lg transition-colors"
            >
              {/* Linke Spalte: Punkt */}
              <div className="flex flex-col items-center w-5 shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${dotColor}`}>
                  {phaseComplete && (
                    <CheckIcon className="w-3 h-3 text-white" strokeWidth={3} />
                  )}
                  {phaseCurrent && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                {(!isLast || isExpanded) && (
                  <div className={`w-0.5 flex-1 min-h-[8px] ${lineColor}`} />
                )}
              </div>

              {/* Text + Chevron */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-5 ${textColor}`}>{phase.label}</p>
              </div>

              {/* Chevron */}
              {phase.subs.length > 0 && (
                <ChevronRightIcon className={`w-4 h-4 shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
              )}
            </button>

            {/* Subprozesse — ausklappbar */}
            <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              {phase.subs.map((sub, si) => {
                const subComplete = phaseComplete || (phaseCurrent && si < progress.subStep)
                const subCurrent = phaseCurrent && si === progress.subStep
                const subFuture = phaseFuture || (phaseCurrent && si > progress.subStep)
                const isLastSub = si === phase.subs.length - 1

                const subDotColor = subComplete
                  ? 'bg-green-400'
                  : subCurrent
                    ? 'bg-[#4573A2] animate-pulse'
                    : 'bg-gray-200'

                const subTextColor = subComplete
                  ? 'text-green-600'
                  : subCurrent
                    ? 'text-[#0D1B3E] font-medium'
                    : 'text-gray-400'

                return (
                  <div key={`${phase.key}-sub-${si}`} className="flex items-center gap-3">
                    {/* Linke Spalte: kleiner Punkt auf gleicher Achse */}
                    <div className="flex flex-col items-center w-5 shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 my-[3px] ${subDotColor}`} />
                      {(!isLastSub || !isLast) && (
                        <div className={`w-0.5 flex-1 min-h-[4px] ${subComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
                      )}
                    </div>
                    {/* Text */}
                    <p className={`text-xs leading-4 pb-1 ${subTextColor}`}>{sub}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
