'use client'

// AAR-137 / W3: Phase-Stepper. 6 Steps horizontal.
// Grün = erledigt, Blau = aktiv, Grau = noch nicht erreicht.
// Abgeschlossene Phasen sind klickbar → setPhase springt zurück.
// Die Aktiv-Phase ist ebenfalls klickbar (no-op). Nicht-erreichte Phasen sind
// disabled, damit der Dispatcher nicht voreilig Phasen überspringt.

import { CheckIcon } from 'lucide-react'
import { useDispatchPhase, type Phase } from './_lib/phase-context'

const PHASE_LABELS: { nr: Phase; label: string }[] = [
  { nr: 1, label: 'Qualifizierung' },
  { nr: 2, label: 'Termin' },
  { nr: 3, label: 'Typ' },
  { nr: 4, label: 'Daten' },
  { nr: 5, label: 'Abschluss' },
  { nr: 6, label: 'Status' },
]

export default function PhaseHeader({
  flowLinkGesendet,
  saUnterschrieben,
}: {
  flowLinkGesendet: boolean
  saUnterschrieben: boolean
}) {
  const { currentPhase, setPhase, qualification } = useDispatchPhase()

  // Wann gilt eine Phase als abgeschlossen? (Notion-Spec AAR-137)
  const completed: Record<Phase, boolean> = {
    1: qualification.q1_schuldfrage && qualification.q2_schaden && qualification.q3_polizei,
    2: qualification.q5_svTermin,
    3: qualification.q4_schadentyp,
    4: qualification.q6_gegnerKz && qualification.q7_fahrzeug && qualification.q8_schadenhergang,
    5: flowLinkGesendet,
    6: saUnterschrieben,
  }

  return (
    <nav aria-label="Dispatch-Phasen" className="mb-6">
      <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
        {PHASE_LABELS.map(({ nr, label }, idx) => {
          const isActive = currentPhase === nr
          const isDone = completed[nr]
          const canNavigate = isDone || isActive || completed[(nr - 1) as Phase] || nr === 1
          return (
            <li key={nr} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => canNavigate && setPhase(nr)}
                disabled={!canNavigate}
                aria-current={isActive ? 'step' : undefined}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isDone
                      ? 'bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer'
                      : canNavigate
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-white text-blue-600'
                      : isDone
                        ? 'bg-green-500 text-white'
                        : 'bg-white text-gray-400 border border-gray-300'
                  }`}
                >
                  {isDone && !isActive ? <CheckIcon className="w-3 h-3" /> : nr}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
              {idx < PHASE_LABELS.length - 1 && (
                <span className={`h-px w-3 sm:w-6 ${isDone ? 'bg-green-300' : 'bg-gray-200'}`} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
