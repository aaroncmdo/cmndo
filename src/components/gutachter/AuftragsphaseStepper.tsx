'use client'

// CMM-23: 3-Phasen-Stepper im SV-Fall-Header. Zeigt Termin → Besichtigung
// → Gutachten mit Marker auf der aktuellen Phase. Mit Gutachten-Upload =
// Auftrag durch, Stepper switched auf "Abgeschlossen"-State.

import { CheckIcon, CalendarIcon, MapPinIcon, FileTextIcon } from 'lucide-react'
import {
  AUFTRAGS_PHASE_INDEX,
  AUFTRAGS_PHASE_LABEL,
  FALL_PHASE_LABEL,
  isFallPhase,
  type AuftragsPhase,
  type SvLifecyclePhase,
} from '@/lib/auftrag/phase'

const PHASES: { key: AuftragsPhase; icon: typeof CalendarIcon }[] = [
  { key: 'termin', icon: CalendarIcon },
  { key: 'besichtigung', icon: MapPinIcon },
  { key: 'gutachten', icon: FileTextIcon },
]

export default function AuftragsphaseStepper({ phase }: { phase: SvLifecyclePhase }) {
  const fallPhase = isFallPhase(phase) ? phase : null
  const auftragsPhaseKey: AuftragsPhase = fallPhase ? 'abgeschlossen' : (phase as AuftragsPhase)
  const aktuellIdx = AUFTRAGS_PHASE_INDEX[auftragsPhaseKey]
  const abgeschlossen = auftragsPhaseKey === 'abgeschlossen'

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border px-6 py-4">
      <div className="flex items-center gap-3">
        {PHASES.map((p, i) => {
          const isCurrent = !abgeschlossen && i === aktuellIdx
          const isDone = abgeschlossen || i < aktuellIdx
          const Icon = p.icon
          return (
            <div key={p.key} className="flex items-center gap-3 min-w-0">
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
              <p
                className={`text-sm font-semibold truncate ${
                  isCurrent
                    ? 'text-claimondo-navy'
                    : isDone
                      ? 'text-emerald-700'
                      : 'text-claimondo-ondo/60'
                }`}
              >
                {AUFTRAGS_PHASE_LABEL[p.key]}
              </p>
              {i < PHASES.length - 1 && (
                <div
                  className={`flex-1 h-px min-w-8 mx-2 ${
                    isDone ? 'bg-emerald-300' : 'bg-claimondo-border'
                  }`}
                />
              )}
            </div>
          )
        })}
        {fallPhase && (
          <span className="ml-auto text-xs uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 whitespace-nowrap">
            {FALL_PHASE_LABEL[fallPhase]}
          </span>
        )}
      </div>
    </div>
  )
}
