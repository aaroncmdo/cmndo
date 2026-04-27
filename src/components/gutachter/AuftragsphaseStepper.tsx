// CMM-23: 3-Phasen-Stepper im SV-Fall-Header. Zeigt Termin → Besichtigung
// → Gutachten mit Marker auf der aktuellen Phase. Mit Gutachten-Upload =
// Auftrag durch, Stepper switched auf "Abgeschlossen"-State.

import { CheckIcon, CalendarIcon, MapPinIcon, FileTextIcon } from 'lucide-react'
import {
  AUFTRAGS_PHASE_INDEX,
  AUFTRAGS_PHASE_LABEL,
  type AuftragsPhase,
} from '@/lib/auftrag/phase'

const PHASES: { key: AuftragsPhase; icon: typeof CalendarIcon }[] = [
  { key: 'termin', icon: CalendarIcon },
  { key: 'besichtigung', icon: MapPinIcon },
  { key: 'gutachten', icon: FileTextIcon },
]

export default function AuftragsphaseStepper({ phase }: { phase: AuftragsPhase }) {
  const aktuellIdx = AUFTRAGS_PHASE_INDEX[phase]
  const abgeschlossen = phase === 'abgeschlossen'

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border p-4">
      <div className="flex items-center justify-between gap-2">
        {PHASES.map((p, i) => {
          const isCurrent = !abgeschlossen && i === aktuellIdx
          const isDone = abgeschlossen || i < aktuellIdx
          const Icon = p.icon
          return (
            <div key={p.key} className="flex-1 flex items-center gap-2 min-w-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                      ? 'bg-claimondo-navy text-white'
                      : 'bg-claimondo-border/40 text-claimondo-ondo'
                }`}
              >
                {isDone ? <CheckIcon className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold truncate ${
                    isCurrent ? 'text-claimondo-navy' : isDone ? 'text-emerald-700' : 'text-claimondo-ondo'
                  }`}
                >
                  {AUFTRAGS_PHASE_LABEL[p.key]}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
                  {isCurrent ? 'Aktuell' : isDone ? 'Erledigt' : 'Offen'}
                </p>
              </div>
              {i < PHASES.length - 1 && (
                <div
                  className={`hidden sm:block flex-1 h-px mx-1 ${
                    isDone || (isCurrent && i + 1 <= aktuellIdx)
                      ? 'bg-emerald-300'
                      : 'bg-claimondo-border'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
      {abgeschlossen && (
        <p className="mt-3 text-xs text-emerald-700 font-medium">
          ✓ Auftrag abgeschlossen — der Fall liegt jetzt beim Kundenbetreuer.
        </p>
      )}
    </div>
  )
}
