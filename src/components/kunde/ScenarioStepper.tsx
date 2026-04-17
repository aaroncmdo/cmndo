'use client'

import { useState } from 'react'
import { ChevronDownIcon, CheckIcon } from 'lucide-react'
import type { Phase, Progress } from './stepperConfig'

// AAR-367: Vertikale Timeline statt Accordion.
// - Erledigte Phasen: kompakte Zeile mit grünem Haken, klickbar zum Aufklappen
//   (Kunde kann sehen was schon passiert ist — gut für Transparenz).
// - Aktuelle Phase: immer expanded, blau hervorgehoben, zeigt live Sub-Step-Status.
// - Zukünftige Phasen: sichtbar aber ausgegraut, Sub-Steps inline als Vorschau
//   „was kommt noch" — ohne Interaktion.
export default function ScenarioStepper({ phasen, progress }: { phasen: Phase[]; progress: Progress }) {
  // Erledigte Phasen starten zugeklappt; nur der User kann sie per Klick öffnen.
  const [expandedCompleted, setExpandedCompleted] = useState<Set<number>>(() => new Set())

  function toggleCompleted(idx: number) {
    setExpandedCompleted(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <ol className="flex flex-col">
      {phasen.map((phase, pi) => {
        const isLast = pi === phasen.length - 1
        const phaseComplete = pi < progress.phase
        const phaseCurrent = pi === progress.phase
        const phaseFuture = pi > progress.phase
        // Erledigt = collapsed by default, User kann öffnen
        // Aktuell = immer offen
        // Zukunft = immer offen (aber grau) → zeigt was kommt
        const showSubs = phaseCurrent || phaseFuture || expandedCompleted.has(pi)

        return (
          <li key={phase.key} className="relative">
            {/* Phasen-Header */}
            {phaseComplete ? (
              <button
                type="button"
                onClick={() => toggleCompleted(pi)}
                className="flex items-center gap-3 w-full text-left py-2 rounded-lg hover:bg-green-50/50 transition-colors"
                aria-expanded={showSubs}
              >
                <div className="flex flex-col items-center w-6 shrink-0">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckIcon className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 min-h-[12px] bg-green-300 mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-green-700 truncate">{phase.label}</p>
                  <ChevronDownIcon
                    className={`w-4 h-4 shrink-0 text-green-600 transition-transform duration-200 ${showSubs ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
            ) : phaseCurrent ? (
              <div className="flex items-start gap-3 py-2 px-3 -mx-3 rounded-xl bg-[#4573A2]/5 border border-[#4573A2]/20">
                <div className="flex flex-col items-center w-6 shrink-0">
                  <div className="w-6 h-6 rounded-full bg-[#4573A2] flex items-center justify-center ring-4 ring-[#4573A2]/15 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 min-h-[12px] bg-gray-200 mt-0.5" />}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-bold text-[#0D1B3E]">{phase.label}</p>
                  {phase.desc && <p className="mt-0.5 text-xs text-gray-600">{phase.desc}</p>}
                </div>
              </div>
            ) : (
              // Zukunft — sichtbar aber grau, kein Klick
              <div className="flex items-center gap-3 py-2 opacity-60">
                <div className="flex flex-col items-center w-6 shrink-0">
                  <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-gray-200" />
                  {!isLast && <div className="w-0.5 flex-1 min-h-[12px] bg-gray-200 mt-0.5" />}
                </div>
                <p className="text-sm text-gray-400 flex-1 min-w-0">{phase.label}</p>
              </div>
            )}

            {/* Sub-Steps — ausklappbar bei erledigten, immer sichtbar bei aktuell/zukunft */}
            {phase.subs.length > 0 && (
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  showSubs ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <ol className="ml-3 pl-6 border-l-2 border-gray-100 py-1 space-y-1.5">
                  {phase.subs.map((sub, si) => {
                    const subComplete = phaseComplete || (phaseCurrent && si < progress.subStep)
                    const subCurrent = phaseCurrent && si === progress.subStep
                    const subFuture = phaseFuture || (phaseCurrent && si > progress.subStep)

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
                      <li key={`${phase.key}-sub-${si}`} className={`flex items-center gap-2 ${subFuture ? 'opacity-70' : ''}`}>
                        <div className={`w-2 h-2 rounded-full shrink-0 ${subDotColor}`} />
                        <span className={`text-xs ${subTextColor}`}>{sub}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
