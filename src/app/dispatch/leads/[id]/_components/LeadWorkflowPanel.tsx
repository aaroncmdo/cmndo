'use client'

// Dispatch-Leads-Workflow-Rebuild (2026-07-07): die komponierte Workflow-Kopfzone
// = Pipeline-Schiene + Next-Best-Action-Hero (der Badge sitzt im Hero). DIES ist
// die Drop-in-Flaeche fuer Phase 1b: die Shell rendert einfach
// <LeadWorkflowPanel result={deriveLeadWorkflowState(...)} onPrimaryAction={...} />
// und verdrahtet die echte Zustands-Aktion. Bis dahin rein praesentational.

import { Stack } from '@/components/primitives'
import type { LeadWorkflowResult } from '../_lib/deriveLeadWorkflowState'
import { spineIndexForState } from '../_lib/leadWorkflowMeta'
import LeadWorkflowStepper from './LeadWorkflowStepper'
import LeadNextBestAction from './LeadNextBestAction'

export default function LeadWorkflowPanel({
  result,
  onPrimaryAction,
  loading,
}: {
  result: LeadWorkflowResult
  onPrimaryAction?: () => void
  loading?: boolean
}) {
  return (
    <Stack gap={4}>
      <LeadWorkflowStepper current={spineIndexForState(result.state)} />
      <LeadNextBestAction state={result.state} onPrimaryAction={onPrimaryAction} loading={loading} />
    </Stack>
  )
}
