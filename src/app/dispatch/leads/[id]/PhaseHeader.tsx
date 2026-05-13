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
//
// 2026-05-11: iOS-Glass-Polish — Step-Rail-Pattern (Design-Brief §8.6):
// Active = ondo + Ring-Glow + scale, Done = emerald-Check, Idle = white + Border.

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
    ? 'bg-claimondo-ondo text-white shadow-cta-ondo scale-[1.02]'
    : isDone
      ? 'bg-claimondo-navy/[0.06] text-claimondo-navy hover:bg-claimondo-navy/[0.10] cursor-pointer'
      : canNavigate
        ? 'bg-white text-claimondo-shield border border-claimondo-navy/[0.08] hover:border-claimondo-ondo hover:text-claimondo-navy cursor-pointer'
        : 'bg-white/60 text-claimondo-shield/50 border border-claimondo-navy/[0.06] cursor-not-allowed'
  const circle = isActive
    ? 'bg-white text-claimondo-ondo shadow-[0_0_0_4px_rgba(69,115,162,.16)]'
    : isDone
      ? 'bg-emerald-500 text-white shadow-[0_0_0_3px_rgba(52,199,89,.18)]'
      : 'bg-white text-claimondo-shield/70 border border-claimondo-navy/[0.10]'
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
          className="w-full flex items-center justify-between gap-3 min-h-12 px-5 rounded-full bg-claimondo-ondo text-white text-sm font-semibold tracking-[-.01em] shadow-cta-ondo transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] active:scale-[0.98]"
        >
          <span className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-[12px] font-bold">
              {currentPhase}
            </span>
            <span>{currentLabel}</span>
          </span>
          <span className="text-white/80 text-xs font-medium">Wechseln →</span>
        </button>
        {/* Dot-Tracker — visualisiert Progress in einer dezenten Zeile */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {PHASE_LABELS.map(({ nr }) => {
            const isCurr = nr === currentPhase
            const isDone = completed[nr]
            const cls = isCurr
              ? 'w-3 h-3 bg-claimondo-ondo shadow-[0_0_0_3px_rgba(69,115,162,.16)]'
              : isDone
                ? 'w-2 h-2 bg-emerald-500'
                : 'w-2 h-2 bg-claimondo-navy/[0.12]'
            return <span key={nr} className={`rounded-full transition-all duration-200 ${cls}`} aria-hidden />
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
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${cls.wrapper}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all ${cls.circle}`}
                >
                  {isDone && !isActive ? <CheckIcon className="w-3 h-3" /> : nr}
                </span>
                <span>{label}</span>
              </button>
              {idx < PHASE_LABELS.length - 1 && (
                <span className={`h-px w-3 sm:w-6 ${isDone ? 'bg-emerald-300' : 'bg-claimondo-navy/[0.10]'}`} />
              )}
            </li>
          )
        })}
      </ol>

      {/* Bottom-Sheet — wird auf Mobile durch die Pill geöffnet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[28px] px-4 pb-6 pt-3 border-t border-white/65 bg-white/95 backdrop-blur-xl">
          <SheetTitle className="text-claimondo-navy mb-3 tracking-[-.018em]">Phase wechseln</SheetTitle>
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
                  className={`w-full flex items-center gap-3 min-h-14 px-4 rounded-2xl text-sm font-semibold tracking-[-.005em] transition-all duration-200 ${cls.wrapper}`}
                >
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-all ${cls.circle}`}>
                    {isDone && !isActive ? <CheckIcon className="w-3.5 h-3.5" /> : nr}
                  </span>
                  <span className="flex-1 text-left">{label}</span>
                  {isDone && <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />}
                </button>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
