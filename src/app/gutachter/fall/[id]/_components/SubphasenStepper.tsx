'use client'

// AAR-289: Sub-Stepper innerhalb der aktuellen Phase. Aktiver Dot pulsiert,
// abgeschlossene mit Haken. Mobile horizontal scrollbar.

import { CheckIcon } from 'lucide-react'
import { getPhaseSubphasen, type SvSubphase } from '@/lib/gutachter/subphase'

export function SubphasenStepper({ currentSubphase }: { currentSubphase: SvSubphase }) {
  if (currentSubphase.phase === 6 && currentSubphase.code === 'honorar-ueberwiesen') {
    // Terminal-Subphase — kein Stepper, nur Hinweis
    return null
  }
  const subphasen = getPhaseSubphasen(currentSubphase.phase)
  if (subphasen.length === 0) return null

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto pb-0.5"
      role="list"
      aria-label="Subphasen"
    >
      {subphasen.map((sp, i) => {
        const isCompleted = i < currentSubphase.subphaseIndex
        const isCurrent = i === currentSubphase.subphaseIndex
        return (
          <div key={sp.code} className="flex items-center gap-1 shrink-0" role="listitem">
            <div
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${sp.label} ${isCompleted ? 'abgeschlossen' : isCurrent ? 'aktuell' : 'offen'}`}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                isCurrent
                  ? 'bg-[#4573A2]/10 text-[#1E3A5F] ring-1 ring-[#4573A2]'
                  : isCompleted
                    ? 'text-emerald-700'
                    : 'text-gray-400'
              }`}
            >
              {isCompleted ? (
                <CheckIcon className="w-3 h-3" />
              ) : isCurrent ? (
                <span className="w-2 h-2 rounded-full bg-[#4573A2] animate-pulse" aria-hidden="true" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-gray-300" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">
                {currentSubphase.phase}.{i + 1} {sp.label}
              </span>
            </div>
            {i < subphasen.length - 1 && (
              <div
                className={`w-3 h-px ${isCompleted ? 'bg-emerald-300' : 'bg-gray-200'}`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
