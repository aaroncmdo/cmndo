// CMM-32f: Kombinierter 4-Phasen-Stepper für die Kunde-Fallseite.
// Zeigt erfassung → begutachtung → regulierung → abschluss mit der
// aktiven Subphase inline beim aktuellen Hauptschritt.
// Side-Quests (Nachbesichtigung/Stellungnahme während Regulierung) werden
// als zusätzliche Zeile unter dem Stepper angezeigt.

import React from 'react'
import { CheckIcon, ClipboardListIcon, WrenchIcon, ShieldCheckIcon, FlagIcon } from 'lucide-react'
import {
  MAIN_PHASE_LABEL,
  SUBPHASE_LABEL,
  type ClaimMainPhase,
  type ClaimLifecycle,
} from '@/lib/claims/lifecycle'

const MAIN_PHASES: { key: ClaimMainPhase; icon: typeof ClipboardListIcon }[] = [
  { key: 'erfassung', icon: ClipboardListIcon },
  { key: 'begutachtung', icon: WrenchIcon },
  { key: 'regulierung', icon: ShieldCheckIcon },
  { key: 'abschluss', icon: FlagIcon },
]

const MAIN_PHASE_INDEX: Record<ClaimMainPhase, number> = {
  erfassung: 0,
  begutachtung: 1,
  regulierung: 2,
  abschluss: 3,
}

export default function ClaimStepper({ lifecycle }: { lifecycle: ClaimLifecycle }) {
  const aktuellIdx = MAIN_PHASE_INDEX[lifecycle.mainPhase]
  const abgeschlossen = lifecycle.mainPhase === 'abschluss'

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border px-4 sm:px-6 py-4 space-y-3">
      <div className="flex items-center w-full">
        {MAIN_PHASES.map((p, i) => {
          const isCurrent = !abgeschlossen && i === aktuellIdx
          const isDone = abgeschlossen || i < aktuellIdx
          const Icon = p.icon
          return (
            <React.Fragment key={p.key}>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                        : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                  }`}
                >
                  {isDone ? <CheckIcon className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex flex-col min-w-0">
                  <p
                    className={`text-sm font-semibold whitespace-nowrap ${
                      isCurrent
                        ? 'text-claimondo-navy'
                        : isDone
                          ? 'text-emerald-700'
                          : 'text-claimondo-ondo/60'
                    }`}
                  >
                    {MAIN_PHASE_LABEL[p.key]}
                  </p>
                  {isCurrent && (
                    <p className="text-[11px] text-claimondo-ondo whitespace-nowrap mt-0.5">
                      {SUBPHASE_LABEL[lifecycle.subPhase]}
                    </p>
                  )}
                </div>
              </div>
              {i < MAIN_PHASES.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 sm:mx-4 ${isDone ? 'bg-emerald-300' : 'bg-claimondo-border'}`}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Side-Quests (Nachbesichtigung / Stellungnahme während Regulierung) */}
      {lifecycle.aktiveSideQuests.length > 0 && (
        <div className="border-t border-claimondo-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo mb-1.5">
            Zusätzlich aktiv
          </p>
          <div className="flex flex-wrap gap-2">
            {lifecycle.aktiveSideQuests.map((auftrag) => (
              <span
                key={auftrag.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-medium text-violet-700"
              >
                {auftrag.typ === 'nachbesichtigung' ? 'Nachbesichtigung' : 'Stellungnahme'}
                <span className="text-violet-500">· {SUBPHASE_LABEL[
                  auftrag.status === 'termin' ? 'termin'
                  : auftrag.status === 'besichtigung' ? 'besichtigung'
                  : 'gutachten'
                ]}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
