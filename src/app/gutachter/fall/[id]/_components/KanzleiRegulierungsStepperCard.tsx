'use client'

// AAR-293: Kanzlei + Regulierungs-Stepper für Phase 5.x. Schritte werden aus
// faelle.status abgeleitet (timestamps pro Step gibt es heute nur für
// kanzlei_uebergeben_am — andere via status). Timer „seit X Tagen" basiert
// auf kanzlei_uebergeben_am.

import { CheckCircle2Icon, CircleIcon, ClockIcon } from 'lucide-react'
import { tageSeit } from '@/lib/gutachter/abrechnung'
import type { SvSubphase } from '@/lib/gutachter/subphase'

type Fall = {
  status: string | null
  kanzlei_uebergeben_am: string | null
}

const STEPS = [
  {
    code: 'kanzlei-uebergeben',
    label: 'An Kanzlei übergeben',
    description: 'Dein Gutachten ist bei der Kanzlei und wird juristisch geprüft.',
  },
  {
    code: 'anspruchsschreiben',
    label: 'Anspruchsschreiben versandt',
    description: 'Kanzlei hat die Forderung an die Versicherung geschickt.',
  },
  {
    code: 'regulierung',
    label: 'Regulierung läuft',
    description: 'Versicherung ist am Zug. Es wird reguliert.',
  },
] as const

export function KanzleiRegulierungsStepperCard({
  fall,
  subphase,
}: {
  fall: Fall
  subphase: SvSubphase
}) {
  const currentIndex = STEPS.findIndex((s) => s.code === subphase.code)
  // Timer für die Kanzlei-Phase als ganzes — feinere Timestamps pro Step
  // existieren heute nicht in der DB (Folge-Spec).
  const tageKanzlei = tageSeit(fall.kanzlei_uebergeben_am)

  return (
    <div className="bg-white rounded-2xl border border-claimondo-border p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-claimondo-ondo font-semibold">
          Kanzlei & Regulierung
        </p>
        {tageKanzlei != null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-claimondo-ondo">
            <ClockIcon className="w-3 h-3" />
            seit {tageKanzlei} {tageKanzlei === 1 ? 'Tag' : 'Tagen'}
          </span>
        )}
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentIndex
          const isActive = idx === currentIndex
          return (
            <li
              key={step.code}
              className={`flex gap-3 ${isActive ? '' : 'opacity-70'}`}
            >
              <div className="pt-0.5 shrink-0">
                {isDone ? (
                  <CheckCircle2Icon className="w-5 h-5 text-emerald-500" />
                ) : isActive ? (
                  <div className="w-5 h-5 rounded-full bg-[var(--brand-secondary)] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  </div>
                ) : (
                  <CircleIcon className="w-5 h-5 text-claimondo-ondo/50" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    isActive
                      ? 'text-claimondo-navy'
                      : isDone
                        ? 'text-claimondo-navy'
                        : 'text-claimondo-ondo'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-claimondo-ondo mt-0.5">{step.description}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="border-t border-claimondo-border pt-3">
        <p className="text-xs text-claimondo-ondo">
          Du wirst benachrichtigt sobald die Zahlung eingegangen ist. Keine Aktion nötig.
        </p>
      </div>
    </div>
  )
}
