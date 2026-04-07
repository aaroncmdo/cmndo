'use client'

import type { Phase, Progress } from './stepperConfig'

export default function ScenarioStepper({ phasen, progress }: { phasen: Phase[]; progress: Progress }) {
  // Alle sichtbaren Elemente (Phasen + Subs) in eine flache Liste fuer die durchgehende Linie
  const items: { type: 'phase' | 'sub'; phaseIdx: number; subIdx?: number; phase: Phase; label: string; desc?: string }[] = []

  for (let pi = 0; pi < phasen.length; pi++) {
    const phaseStarted = pi <= progress.phase
    if (!phaseStarted) break

    items.push({ type: 'phase', phaseIdx: pi, phase: phasen[pi], label: phasen[pi].label, desc: phasen[pi].desc })

    for (let si = 0; si < phasen[pi].subs.length; si++) {
      const phaseCurrent = pi === progress.phase
      const phaseComplete = pi < progress.phase
      const subVisible = phaseComplete || (phaseCurrent && si <= progress.subStep)
      if (!subVisible) break

      items.push({ type: 'sub', phaseIdx: pi, subIdx: si, phase: phasen[pi], label: phasen[pi].subs[si] })
    }
  }

  return (
    <div className="flex flex-col">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        const phaseComplete = item.phaseIdx < progress.phase
        const phaseCurrent = item.phaseIdx === progress.phase

        if (item.type === 'phase') {
          const started = item.phaseIdx <= progress.phase
          return (
            <div key={`phase-${item.phaseIdx}`} className="flex gap-3">
              {/* Linke Spalte: Punkt + Verbindungslinie */}
              <div className="flex flex-col items-center w-5 shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  started ? 'bg-green-500' : 'bg-gray-200'
                }`}>
                  {started && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {!isLast && (
                  <div className={`w-0.5 flex-1 min-h-[8px] ${phaseComplete || phaseCurrent ? 'bg-green-300' : 'bg-gray-200'}`} />
                )}
              </div>
              {/* Rechte Spalte: Text */}
              <div className="pb-2 min-w-0">
                <p className={`text-base font-semibold leading-5 ${started ? 'text-green-600' : 'text-gray-400'}`}>
                  {item.label}
                </p>
                {phaseCurrent && <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>}
              </div>
            </div>
          )
        }

        // Subprozess
        const subComplete = phaseComplete || (phaseCurrent && (item.subIdx ?? 0) < progress.subStep)
        const subCurrent = phaseCurrent && item.subIdx === progress.subStep

        return (
          <div key={`sub-${item.phaseIdx}-${item.subIdx}`} className="flex gap-3">
            {/* Linke Spalte: kleiner Punkt zentriert in der gleichen w-5 Spalte */}
            <div className="flex flex-col items-center w-5 shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 my-[3px] ${
                subComplete ? 'bg-green-400' : subCurrent ? 'bg-[#4573A2] animate-pulse' : 'bg-gray-200'
              }`} />
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[4px] ${subComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </div>
            {/* Rechte Spalte: Text */}
            <div className="pb-1 min-w-0">
              <p className={`text-sm leading-4 ${subComplete ? 'text-green-600' : subCurrent ? 'text-[#0D1B3E] font-medium' : 'text-gray-400'}`}>
                {item.label}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
