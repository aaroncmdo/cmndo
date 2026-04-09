'use client'

import { CheckIcon } from 'lucide-react'
import type { StepperState, SubProzess } from '@/lib/fall/stepper-state'

// BUG-99: Ein einziger horizontaler Stepper fuer die ganze Fall-Zeitachse.
// Aaron-Wunsch: 'alles horizontal und wenn es doppelte phasen gibt mergen
// das macht ja keinen sinn'.
//
// Vorher: VorPhasen-Row (horizontal) + Hauptphasen-Vertical-Timeline mit
// collapsible Subs pro Phase. War doppelt, unuebersichtlich.
//
// Jetzt: VorPhasen + Hauptphasen zu einer horizontalen Row gemerged, drunter
// eine kleinere Sub-Row fuer die Subs der aktiven Phase.
//
// Claimondo-CI (BUG-95 Regel, kein gruen):
//   erledigt = Ondo-Blue #4573A2
//   aktiv    = Navy      #0D1B3E
//   offen    = gray

type MergedPhase = {
  key: string
  label: string
  status: 'offen' | 'aktiv' | 'erledigt'
  subs: SubProzess[]
}

function mergePhases(state: StepperState): MergedPhase[] {
  // VorPhasen + Hauptphasen in eine flache Liste ziehen
  const merged: MergedPhase[] = [
    ...state.vorPhasen.map((vp, i) => ({
      key: `vor-${i}`,
      label: vp.label,
      status: (vp.erledigt ? 'erledigt' : 'offen') as MergedPhase['status'],
      subs: [] as SubProzess[],
    })),
    ...state.hauptPhasen.map(hp => ({
      key: hp.key,
      label: hp.label,
      status: hp.status,
      subs: hp.subs,
    })),
  ]

  // Falls keine Hauptphase 'aktiv' ist (z.B. weil VorPhase noch offen),
  // wird die erste nicht-erledigte Phase zum aktiven Schritt.
  const hasAktiv = merged.some(p => p.status === 'aktiv')
  if (!hasAktiv) {
    const firstOffen = merged.findIndex(p => p.status === 'offen')
    if (firstOffen >= 0) merged[firstOffen].status = 'aktiv'
  }

  return merged
}

export default function FallStepper({ state }: { state: StepperState }) {
  const phases = mergePhases(state)
  const activeIdx = phases.findIndex(p => p.status === 'aktiv')
  const activePhase = activeIdx >= 0 ? phases[activeIdx] : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
      {/* Haupt-Stepper horizontal */}
      <div className="overflow-x-auto">
        <ol className="flex items-start min-w-max pb-1">
          {phases.map((phase, i) => {
            const isLast = i === phases.length - 1
            const isDone = phase.status === 'erledigt'
            const isActive = phase.status === 'aktiv'
            const connectorDone = phases[i - 1]?.status === 'erledigt'

            return (
              <li key={phase.key} className="flex items-start">
                {/* Connector zum vorherigen Schritt (ausser vor dem 1.) */}
                {i > 0 && (
                  <div
                    className={`h-0.5 w-6 sm:w-10 mt-4 transition-colors ${
                      connectorDone ? 'bg-[#4573A2]' : 'bg-gray-200'
                    }`}
                    aria-hidden="true"
                  />
                )}

                {/* Step Circle + Label */}
                <div className="flex flex-col items-center min-w-[72px] px-1">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      isDone
                        ? 'bg-[#4573A2] text-white'
                        : isActive
                        ? 'bg-[#0D1B3E] text-white ring-4 ring-[#0D1B3E]/15'
                        : 'bg-gray-100 text-gray-400 border border-gray-200'
                    }`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {isDone ? <CheckIcon className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={`mt-1.5 text-[10px] leading-tight text-center max-w-[92px] ${
                      isActive
                        ? 'text-[#0D1B3E] font-semibold'
                        : isDone
                        ? 'text-[#1E3A5F] font-medium'
                        : 'text-gray-400'
                    }`}
                  >
                    {phase.label}
                  </span>
                </div>

                {/* (der Connector fuer den NAECHSTEN Schritt wird dort gerendert) */}
                {isLast ? null : null}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Sub-Stepper fuer die aktive Phase (nur wenn Subs vorhanden) */}
      {activePhase && activePhase.subs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-2">
            {activePhase.label} — Details
          </p>
          <div className="overflow-x-auto">
            <div className="flex items-center gap-0 min-w-max pb-1">
              {activePhase.subs.map((sub, i) => {
                const prev = i > 0 ? activePhase.subs[i - 1] : null
                const connectorColor = prev?.status === 'erledigt' ? 'bg-[#4573A2]' : 'bg-gray-200'
                return (
                  <div key={sub.key} className="flex items-center">
                    {i > 0 && <div className={`w-4 h-0.5 ${connectorColor}`} aria-hidden="true" />}
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap border ${
                        sub.status === 'aktiv'
                          ? 'bg-[#0D1B3E]/5 border-[#0D1B3E]/30 text-[#0D1B3E] font-medium'
                          : sub.status === 'erledigt'
                          ? 'bg-[#4573A2]/5 border-[#4573A2]/20 text-[#1E3A5F]'
                          : 'bg-gray-50 border-gray-200 text-gray-400'
                      }`}
                    >
                      {sub.status === 'erledigt' && <CheckIcon className="w-3 h-3 flex-shrink-0 text-[#4573A2]" />}
                      <span>{sub.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
