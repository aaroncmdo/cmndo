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

// Phase 1d: Zustand -> Sprungziel der Next-Best-Action. Tab-Zustaende schalten den
// relevanten Tab in DispatchLeadForm; die FlowLink-Zustaende (senden/nachfassen/
// warten) scrollen zum FlowLink-Versand-Panel UNTER den Tabs — dort waehlt der
// Dispatcher den Kanal (WhatsApp/SMS/E-Mail). BEWUSST kein Auto-Send: der Versand
// ist outward-facing, die Kanal-Wahl bleibt manuell. terminal = read-only, kein Ziel.
type LeadJumpTarget = { tab: string } | { scrollTo: string }
const STATE_ACTION_TARGET: Partial<Record<LeadWorkflowState, LeadJumpTarget>> = {
  neu: { tab: 'kontakt' },
  qualifizieren: { tab: 'schaden' },
  sv_zuweisen: { tab: 'termin_sv' },
  rueckruf: { tab: 'kontakt' },
  flowlink_senden: { scrollTo: 'flowlink-panel' },
  nachfassen: { scrollTo: 'flowlink-panel' },
  warten: { scrollTo: 'flowlink-panel' },
}

export default function LeadNextBestAction({
  state,
  onPrimaryAction,
  loading,
  guidanceOnly = false,
}: {
  state: LeadWorkflowState
  onPrimaryAction?: () => void
  loading?: boolean
  /** true = kein CTA-Button (nur Zustand + Titel + Erklaerung als Guidance) — solange
   * die echten Zustands-Aktionen noch nicht verdrahtet sind (Phase-1b additiv). */
  guidanceOnly?: boolean
}) {
  const meta = LEAD_WORKFLOW_META[state]
  // Phase 1c/1d: self-contained Jump (kein Server-Handler noetig) — dispatcht ein
  // Event, DispatchLeadForm hoert darauf: `tab` schaltet den Tab, `scrollTo` scrollt
  // zum Ziel-Panel unter den Tabs (+ kurzer Fokus-Ring).
  const target = STATE_ACTION_TARGET[state]
  const handleClick =
    onPrimaryAction ??
    (target
      ? () =>
          document.dispatchEvent(
            new CustomEvent('claimondo:lead-workflow-jump', { detail: target }),
          )
      : undefined)
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
        {meta.ctaLabel && !guidanceOnly && handleClick ? (
          <Button variant="navy" onClick={handleClick} loading={loading}>
            {meta.ctaLabel}
          </Button>
        ) : null}
      </Stack>
    </Card>
  )
}
