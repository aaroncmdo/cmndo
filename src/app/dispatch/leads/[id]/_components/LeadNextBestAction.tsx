'use client'

// Dispatch-Leads-Workflow-Rebuild (2026-07-07): der Next-Best-Action-Hero — die
// EINE primaere Aktion des aktuellen Workflow-Zustands, prominent. Zustands-Badge
// (Registry-Domain lead-workflow) + Titel + Erklaerung + CTA. Rein praesentational:
// die echte Aktion kommt als onPrimaryAction-Prop (Phase 1b verdrahtet sie); ohne
// Handler ist der CTA deaktiviert. terminal (read-only) rendert keinen CTA.

import { Card, Stack, Text, Button } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { LeadWorkflowState } from '../_lib/deriveLeadWorkflowState'
import { LEAD_WORKFLOW_META } from '../_lib/leadWorkflowMeta'

export default function LeadNextBestAction({
  state,
  onPrimaryAction,
  loading,
}: {
  state: LeadWorkflowState
  onPrimaryAction?: () => void
  loading?: boolean
}) {
  const meta = LEAD_WORKFLOW_META[state]
  return (
    <Card p={6} radius="lg">
      <Stack gap={3}>
        <StatusBadge domain="lead-workflow" code={state} size="sm" />
        <Text variant="headingMd" as="h2">
          {meta.heroTitle}
        </Text>
        <Text variant="bodySm" color="ondo">
          {meta.heroDescription}
        </Text>
        {meta.ctaLabel ? (
          <Button
            variant="navy"
            onClick={onPrimaryAction}
            loading={loading}
            disabled={!onPrimaryAction}
          >
            {meta.ctaLabel}
          </Button>
        ) : null}
      </Stack>
    </Card>
  )
}
