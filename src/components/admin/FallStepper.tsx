'use client'

import { useState } from 'react'
import { CheckCircle2Icon, ChevronDownIcon, CircleDotIcon, CircleIcon, AlertCircleIcon } from 'lucide-react'
import type { StepperState, HauptPhase, SubProzess, VorPhase } from '@/lib/fall/stepper-state'

const PHASE_COLOR = {
  erledigt: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-500', line: 'bg-green-300' },
  aktiv: { bg: 'bg-[#4573A2]/5', border: 'border-[#4573A2]/30', text: 'text-[#0D1B3E]', icon: 'text-[#4573A2]', line: 'bg-[#4573A2]' },
  offen: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-400', icon: 'text-gray-300', line: 'bg-gray-200' },
}

const SUB_STATUS_ICON: Record<string, { icon: typeof CheckCircle2Icon; color: string }> = {
  erledigt: { icon: CheckCircle2Icon, color: 'text-green-500' },
  aktiv: { icon: AlertCircleIcon, color: 'text-[#E89B3C]' },
  offen: { icon: CircleIcon, color: 'text-gray-300' },
  uebersprungen: { icon: CircleIcon, color: 'text-gray-300' },
}

export default function FallStepper({ state }: { state: StepperState }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
      {/* Vor-Phasen (kompakter Header) */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
        {state.vorPhasen.map((vp, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {vp.erledigt ? (
              <CheckCircle2Icon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            ) : (
              <CircleIcon className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
            )}
            <span className={`text-[11px] font-medium ${vp.erledigt ? 'text-green-700' : 'text-gray-400'}`}>{vp.label}</span>
            {i < state.vorPhasen.length - 1 && <span className="text-gray-200 text-xs mx-1">/</span>}
          </div>
        ))}
      </div>

      {/* Hauptphasen */}
      <div className="space-y-0">
        {state.hauptPhasen.map((phase, idx) => (
          <PhaseRow key={phase.key} phase={phase} isLast={idx === state.hauptPhasen.length - 1} defaultOpen={phase.status === 'aktiv'} />
        ))}
      </div>
    </div>
  )
}

function PhaseRow({ phase, isLast, defaultOpen }: { phase: HauptPhase; isLast: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const colors = PHASE_COLOR[phase.status]
  const hasSubs = phase.subs.length > 0
  const hasActiveSub = phase.subs.some(s => s.status === 'aktiv')

  return (
    <div className="flex">
      {/* Timeline-Linie */}
      <div className="flex flex-col items-center mr-3 w-6">
        {phase.status === 'erledigt' ? (
          <CheckCircle2Icon className="w-5 h-5 text-green-500 flex-shrink-0" />
        ) : phase.status === 'aktiv' ? (
          <div className="w-5 h-5 rounded-full bg-[#4573A2] flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        ) : (
          <CircleIcon className="w-5 h-5 text-gray-300 flex-shrink-0" />
        )}
        {!isLast && <div className={`w-0.5 flex-1 min-h-4 ${colors.line}`} />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-3 ${isLast ? '' : 'mb-1'}`}>
        <button
          onClick={() => hasSubs && setOpen(!open)}
          className={`w-full text-left flex items-center justify-between ${hasSubs ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div>
            <p className={`text-sm font-medium ${colors.text} ${phase.status === 'aktiv' ? 'font-semibold' : ''}`}>
              {phase.label}
              {hasActiveSub && phase.status === 'aktiv' && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-[#E89B3C] bg-[#E89B3C]/10 px-1.5 py-0.5 rounded-full">
                  Aktion nötig
                </span>
              )}
            </p>
            {phase.status === 'aktiv' && <p className="text-xs text-gray-400 mt-0.5">{phase.desc}</p>}
          </div>
          {hasSubs && (
            <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Subprozesse */}
        {open && hasSubs && (
          <div className="mt-2 ml-1 space-y-1.5">
            {phase.subs.map(sub => {
              const si = SUB_STATUS_ICON[sub.status]
              const Icon = si.icon
              return (
                <div key={sub.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
                  sub.status === 'aktiv' ? 'bg-[#E89B3C]/5 border border-[#E89B3C]/20' : 'bg-gray-50'
                }`}>
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${si.color}`} />
                  <span className={sub.status === 'aktiv' ? 'text-[#0D1B3E] font-medium' : sub.status === 'erledigt' ? 'text-green-700' : 'text-gray-400'}>
                    {sub.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
