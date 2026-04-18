'use client'

// AAR-289 / AAR-394: Horizontaler Phasen-Stepper für die SV-Fallakte
// (Phase 4 → 5 → 6). Aktive Phase Ondo Blue, abgeschlossene grün, zukünftige
// grau. AAR-394: füllt jetzt die volle Breite (w-full + flex-1 an den
// Verbindungslinien), damit die Pills sich gleichmäßig verteilen.

import { Fragment } from 'react'
import { CheckIcon, CircleIcon } from 'lucide-react'

const PHASES = [
  { num: 4, label: 'Begutachtung' },
  { num: 5, label: 'Kanzlei-Bearbeitung' },
  { num: 6, label: 'Abschluss' },
] as const

export function PhasenStepper({
  currentPhase,
  isTerminal,
}: {
  currentPhase: 4 | 5 | 6
  isTerminal?: 'abgeschlossen' | 'storniert'
}) {
  if (isTerminal === 'storniert') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium w-fit">
        Fall storniert
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 w-full"
      role="list"
      aria-label="Fallphasen"
    >
      {PHASES.map((p, i) => {
        const isCompleted = p.num < currentPhase
        const isCurrent = p.num === currentPhase
        return (
          <Fragment key={p.num}>
            <div
              role="listitem"
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Phase ${p.num} ${p.label} ${isCompleted ? 'abgeschlossen' : isCurrent ? 'aktuell' : 'offen'}`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium shrink-0 ${
                isCurrent
                  ? 'bg-[var(--brand-secondary)] text-white'
                  : isCompleted
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {isCompleted ? (
                <CheckIcon className="w-3.5 h-3.5" />
              ) : (
                <CircleIcon className="w-3.5 h-3.5" />
              )}
              <span className="whitespace-nowrap">
                Phase {p.num} · {p.label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div
                className={`w-4 sm:w-auto sm:flex-1 sm:min-w-6 h-px ${
                  isCompleted ? 'bg-emerald-300' : 'bg-gray-200'
                }`}
                aria-hidden="true"
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
