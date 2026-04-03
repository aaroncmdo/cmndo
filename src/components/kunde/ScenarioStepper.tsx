'use client'

import type { Phase, Progress } from './stepperConfig'

export default function ScenarioStepper({ phasen, progress }: { phasen: Phase[]; progress: Progress }) {
  return (
    <div>
      {phasen.map((phase, pi) => {
        const phaseStarted = pi <= progress.phase
        const phaseComplete = pi < progress.phase
        const phaseCurrent = pi === progress.phase
        if (!phaseStarted) return null

        return (
          <div key={phase.key}>
            {/* Hauptphase — grosser Punkt */}
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                phaseStarted ? 'bg-green-500' : 'bg-gray-200'
              }`}>
                {phaseStarted && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="pb-1 min-w-0">
                <p className={`text-base font-semibold ${phaseStarted ? 'text-green-600' : 'text-gray-400'}`}>
                  {phase.label}
                </p>
                {phaseCurrent && <p className="text-sm text-gray-500 mt-0.5">{phase.desc}</p>}
              </div>
            </div>

            {/* Subprozesse — kleine Punkte eingerueckt */}
            {phase.subs.map((sub, si) => {
              const subComplete = phaseComplete || (phaseCurrent && si < progress.subStep)
              const subCurrent = phaseCurrent && si === progress.subStep
              const subVisible = phaseComplete || (phaseCurrent && si <= progress.subStep)
              if (!subVisible) return null

              return (
                <div key={`${phase.key}-${si}`} className="flex items-center gap-3 ml-8">
                  <div className="flex flex-col items-center">
                    <div className={`w-0.5 h-2 ${subComplete || subCurrent ? 'bg-green-300' : 'bg-gray-200'}`} />
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      subComplete ? 'bg-green-400' : subCurrent ? 'bg-[#4573A2] animate-pulse' : 'bg-gray-200'
                    }`} />
                    <div className={`w-0.5 h-2 ${subComplete ? 'bg-green-300' : 'bg-gray-200'}`} />
                  </div>
                  <p className={`text-sm ${subComplete ? 'text-green-600' : subCurrent ? 'text-[#0D1B3E] font-medium' : 'text-gray-400'}`}>
                    {sub}
                  </p>
                </div>
              )
            })}

            {/* Verbindungslinie */}
            {phaseStarted && pi < phasen.length - 1 && pi <= progress.phase && (
              <div className="ml-[9px]"><div className={`w-0.5 h-3 ${phaseComplete ? 'bg-green-300' : 'bg-gray-200'}`} /></div>
            )}
          </div>
        )
      })}
    </div>
  )
}
