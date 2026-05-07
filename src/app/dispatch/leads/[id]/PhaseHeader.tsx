'use client'

// AAR-137 / W3: Phase-Stepper. 6 Steps horizontal.
// Grün = erledigt, Blau = aktiv, Grau = noch nicht erreicht.
// Abgeschlossene Phasen sind klickbar → setPhase springt zurück.
// Die Aktiv-Phase ist ebenfalls klickbar (no-op). Nicht-erreichte Phasen sind
// disabled, damit der Dispatcher nicht voreilig Phasen überspringt.
//
// Portal-Review D1 (2026-05-07): Mobile-Layout ist auf <lg eine kompakte
// Pill „Phase X: Label" + Dot-Tracker → Tap öffnet Bottom-Sheet mit allen
// Phasen als full-width Buttons (44 px Tap-Target). Desktop unverändert.

import { useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { useDispatchPhase, type Phase } from './_lib/phase-context'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

const PHASE_LABELS: { nr: Phase; label: string }[] = [
  { nr: 1, label: 'Qualifizierung' },
  { nr: 2, label: 'Termin' },
  { nr: 3, label: 'Typ' },
  { nr: 4, label: 'Daten' },
  { nr: 5, label: 'Abschluss' },
  { nr: 6, label: 'Status' },
]

type CompletedMap = Record<Phase, boolean>

function classesFor({
  isActive,
  isDone,
  canNavigate,
}: {
  isActive: boolean
  isDone: boolean
  canNavigate: boolean
}) {
  const wrapper = isActive
    ? 'bg-claimondo-ondo text-white shadow-sm'
    : isDone
      ? 'bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer'
      : canNavigate
        ? 'bg-claimondo-bg text-claimondo-ondo hover:bg-claimondo-border cursor-pointer'
        : 'bg-claimondo-bg text-claimondo-ondo/50 cursor-not-allowed'
  const circle = isActive
    ? 'bg-white text-claimondo-ondo'
    : isDone
      ? 'bg-green-500 text-white'
      : 'bg-white text-claimondo-ondo/70 border border-claimondo-border'
  return { wrapper, circle }
}

export default function PhaseHeader({
  flowLinkGesendet,
  saUnterschrieben,
}: {
  flowLinkGesendet: boolean
  saUnterschrieben: boolean
}) {
  const { currentPhase, setPhase, qualification } = useDispatchPhase()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Wann gilt eine Phase als abgeschlossen? (Notion-Spec AAR-137)
  const completed: CompletedMap = {
    1: qualification.q1_schuldfrage && qualification.q2_schaden && qualification.q3_polizei,
    2: qualification.q5_svTermin,
    3: qualification.q4_schadentyp,
    4: qualification.q6_gegnerKz && qualification.q7_fahrzeug && qualification.q8_schadenhergang,
    5: flowLinkGesendet,
    6: saUnterschrieben,
  }

  const currentLabel =
    PHASE_LABELS.find((p) => p.nr === currentPhase)?.label ?? `Phase ${currentPhase}`

  return (
    <nav aria-label="Dispatch-Phasen" className="mb-6">
      {/* Mobile/Tablet (<lg): Pill + Dot-Tracker — Tap öffnet Bottom-Sheet */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="w-full flex items-center justify-between gap-3 min-h-12 px-4 rounded-lg bg-claimondo-ondo text-white text-sm font-medium shadow-sm"
        >
          <span className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/15 text-[11px] font-bold">
              {currentPhase}
            </span>
            <span>{currentLabel}</span>
          </span>
          <span className="text-white/80 text-xs">Wechseln →</span>
        </button>
        {/* Dot-Tracker — visualisiert Progress in einer dezenten Zeile */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {PHASE_LABELS.map(({ nr }) => {
            const isCurr = nr === currentPhase
            const isDone = completed[nr]
            const cls = isCurr
              ? 'w-3 h-3 bg-claimondo-ondo'
              : isDone
                ? 'w-2 h-2 bg-green-500'
                : 'w-2 h-2 bg-claimondo-border'
            return <span key={nr} className={`rounded-full transition-all ${cls}`} aria-hidden />
          })}
        </div>
      </div>

      {/* Desktop (lg+): horizontaler Stepper unverändert */}
      <ol className="hidden lg:flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2">
        {PHASE_LABELS.map(({ nr, label }, idx) => {
          const isActive = currentPhase === nr
          const isDone = completed[nr]
          const canNavigate = isDone || isActive || completed[(nr - 1) as Phase] || nr === 1
          const cls = classesFor({ isActive, isDone, canNavigate })
          return (
            <li key={nr} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => canNavigate && setPhase(nr)}
                disabled={!canNavigate}
                aria-current={isActive ? 'step' : undefined}
                className={`flex items-center gap-2 min-h-11 px-3 rounded-lg text-xs font-medium transition-colors ${cls.wrapper}`}
              >
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${cls.circle}`}>
                  {isDone && !isActive ? <CheckIcon className="w-3 h-3" /> : nr}
                </span>
                <span>{label}</span>
              </button>
              {idx < PHASE_LABELS.length - 1 && (
                <span className={`h-px w-3 sm:w-6 ${isDone ? 'bg-green-300' : 'bg-claimondo-border'}`} />
              )}
            </li>
          )
        })}
      </ol>

      {/* Bottom-Sheet — wird auf Mobile durch die Pill geöffnet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-3">
          <SheetTitle className="text-claimondo-navy mb-3">Phase wechseln</SheetTitle>
          <div className="space-y-2">
            {PHASE_LABELS.map(({ nr, label }) => {
              const isActive = currentPhase === nr
              const isDone = completed[nr]
              const canNavigate = isDone || isActive || completed[(nr - 1) as Phase] || nr === 1
              const cls = classesFor({ isActive, isDone, canNavigate })
              return (
                <button
                  key={nr}
                  type="button"
                  onClick={() => {
                    if (!canNavigate) return
                    setPhase(nr)
                    setSheetOpen(false)
                  }}
                  disabled={!canNavigate}
                  aria-current={isActive ? 'step' : undefined}
                  className={`w-full flex items-center gap-3 min-h-14 px-4 rounded-lg text-sm font-medium transition-colors ${cls.wrapper}`}
                >
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${cls.circle}`}>
                    {isDone && !isActive ? <CheckIcon className="w-3.5 h-3.5" /> : nr}
                  </span>
                  <span className="flex-1 text-left">{label}</span>
                  {isDone && <CheckIcon className="w-4 h-4 text-green-600 shrink-0" />}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
