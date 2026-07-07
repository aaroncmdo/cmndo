'use client'

// Dispatch-Leads-Workflow-Rebuild (2026-07-07): die Pipeline-Schiene — zeigt die
// grobe Funnel-Stufe (LEAD_WORKFLOW_SPINE) mit dem aktuellen Meilenstein
// hervorgehoben. Muster analog SelbstzahlerReparaturStepper (Card + Kreis + Label
// + Linie); Farben ueber Claimondo-/Status-Tokens (kein raw hex/status-scale).

import React from 'react'
import { CheckIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import { LEAD_WORKFLOW_SPINE } from '../_lib/leadWorkflowMeta'

export default function LeadWorkflowStepper({ current }: { current: number }) {
  return (
    <Card>
      <div className="flex items-center w-full">
        {LEAD_WORKFLOW_SPINE.map((step, i) => {
          const isDone = i < current
          const isCurrent = i === current
          return (
            <React.Fragment key={step.key}>
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <div
                  className={`w-8 h-8 rounded-ios-lg flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${
                    isDone
                      ? 'bg-success text-white'
                      : isCurrent
                        ? 'bg-claimondo-navy text-white ring-2 ring-claimondo-navy/20'
                        : 'bg-claimondo-border/40 text-claimondo-ondo/60'
                  }`}
                >
                  {isDone ? <CheckIcon className="w-4 h-4" /> : i + 1}
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
                  {step.label}
                </p>
              </div>
              {i < LEAD_WORKFLOW_SPINE.length - 1 && (
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
