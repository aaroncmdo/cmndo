'use client'

// SP-D — Selbstzahler-Reparatur-Stepper (Kunde-Portal). Zeigt die reduzierte
// Selbstzahler-Strecke: Schaden gemeldet -> Werkstatt -> Termin -> Reparatur
// (kein SV/Gutachten/Regulierung). Visuell an ClaimStepper angelehnt; die
// Schritt-Ableitung ist rein (selbstzahlerStepIndex) und beruehrt die
// Kern-Lifecycle/v_claim_phase-Parity NICHT.

import React from 'react'
import { CheckIcon, ClipboardListIcon, WrenchIcon, CalendarIcon, FileSignatureIcon, FlagIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import {
  selbstzahlerStepIndex,
  SELBSTZAHLER_STEPS,
  type SelbstzahlerStep,
} from '@/lib/werkstatt/selbstzahler-stepper'

const STEP_ICON: Record<SelbstzahlerStep, typeof ClipboardListIcon> = {
  schaden: ClipboardListIcon,
  werkstatt: WrenchIcon,
  termin: CalendarIcon,
  freigabe: FileSignatureIcon,
  reparatur: FlagIcon,
}

const STEP_LABEL: Record<SelbstzahlerStep, string> = {
  schaden: 'Schaden gemeldet',
  werkstatt: 'Werkstatt',
  termin: 'Termin',
  freigabe: 'Freigabe',
  reparatur: 'Reparatur',
}

export default function SelbstzahlerReparaturStepper({
  hatWerkstatt,
  terminStatus,
  kvaFreigegeben,
  abgeschlossen,
}: {
  hatWerkstatt: boolean
  terminStatus: string | null
  kvaFreigegeben: boolean
  abgeschlossen: boolean
}) {
  const { currentIndex, abgeschlossen: fertig } = selbstzahlerStepIndex({
    hatWerkstatt,
    terminStatus,
    kvaFreigegeben,
    abgeschlossen,
  })

  return (
    <Card>
      <div className="flex items-center w-full">
        {SELBSTZAHLER_STEPS.map((key, i) => {
          const isDone = fertig || i < currentIndex
          const isCurrent = !fertig && i === currentIndex
          const Icon = STEP_ICON[key]
          return (
            <React.Fragment key={key}>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isDone
                      ? 'bg-success text-white'
                      : isCurrent
                        ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                        : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                  }`}
                >
                  {isDone ? <CheckIcon className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <p
                  className={`text-sm font-semibold whitespace-nowrap ${
                    isCurrent
                      ? 'text-claimondo-navy'
                      : isDone
                        ? 'text-success-strong'
                        : 'text-claimondo-ondo/60'
                  }`}
                >
                  {STEP_LABEL[key]}
                </p>
              </div>
              {i < SELBSTZAHLER_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 sm:mx-4 ${isDone ? 'bg-success/30' : 'bg-claimondo-border'}`}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </Card>
  )
}
