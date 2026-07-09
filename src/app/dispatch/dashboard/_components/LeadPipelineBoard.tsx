// Ops-Cockpit Phase 3b (Dispatch) — Lead-Work-State-Board.
// Zeigt die aktiven Leads gruppiert nach abgeleitetem Workflow-Zustand (aus
// getLeadWorkItems -> deriveLeadWorkflowState), sortiert nach Handlungsdruck, mit
// Owner-Spalte und einem glanceable Rollup-Header (Phase 3b.2). Sanktioniertes
// shared/DataTable (kein handgerolltes Card), State-Badge via Registry-Domain
// lead-workflow, Action-Copy via LEAD_WORKFLOW_META. Jede Zeile verlinkt in die
// Lead-Detailmaske. Server-Component (rein praesentational).

import { Fragment } from 'react'
import Link from 'next/link'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { LEAD_WORKFLOW_META } from '@/app/dispatch/leads/[id]/_lib/leadWorkflowMeta'
import { groupLeadWorkItemsByState } from '@/app/dispatch/_lib/lead-board-groups'
import { computeLeadRollup } from '@/app/dispatch/_lib/lead-board-rollup'
import type { LeadWorkItem } from '@/app/dispatch/_lib/lead-workstate.types'

export function LeadPipelineBoard({ items }: { items: LeadWorkItem[] }) {
  const groups = groupLeadWorkItemsByState(items)
  const rollup = computeLeadRollup(items)

  return (
    <div className="space-y-3">
      {/* Rollup-Header: glanceable Gesamt/Handlungsdruck/nicht-zugewiesen (Phase 3b.2). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-body-sm">
        <span className="font-semibold text-claimondo-navy">{rollup.total} aktiv</span>
        {rollup.unassigned > 0 ? (
          <span className="font-medium text-warning-strong">{rollup.unassigned} nicht zugewiesen</span>
        ) : null}
        <span className="text-claimondo-ondo">
          {rollup.byState.rueckruf} Rückruf · {rollup.byState.sv_zuweisen} SV zuweisen ·{' '}
          {rollup.byState.flowlink_senden} FlowLink · {rollup.byState.nachfassen} Nachfassen
        </span>
      </div>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Lead</Th>
              <Th>Kontakt</Th>
              <Th>Owner</Th>
              <Th>Qual.</Th>
            </Tr>
          </Thead>
          <Tbody>
            {groups.map(({ state, items: groupItems }) => (
              <Fragment key={state}>
                <Tr>
                  <Td colSpan={4} className="bg-claimondo-bg">
                    <div className="flex items-center gap-2">
                      <StatusBadge domain="lead-workflow" code={state} size="sm" />
                      <span className="text-body-sm font-medium text-claimondo-navy">
                        {LEAD_WORKFLOW_META[state].heroTitle}
                      </span>
                      <span className="ml-auto text-caption text-claimondo-ondo/70">
                        {groupItems.length}
                      </span>
                    </div>
                  </Td>
                </Tr>
                {groupItems.map((it) => (
                  <Tr key={it.id}>
                    <Td className="font-medium text-claimondo-navy">
                      <Link href={`/dispatch/leads/${it.id}`} className="hover:underline">
                        {it.display.title}
                      </Link>
                    </Td>
                    <Td className="text-body-sm text-claimondo-ondo font-mono">
                      {it.display.telefon ?? '–'}
                    </Td>
                    <Td className="text-body-sm">
                      {it.ownerName ? (
                        <span className="text-claimondo-ondo">{it.ownerName}</span>
                      ) : (
                        <span className="text-claimondo-ondo/50">Nicht zugewiesen</span>
                      )}
                    </Td>
                    <Td className="text-body-sm text-claimondo-ondo">{it.qualCompleted}/8</Td>
                  </Tr>
                ))}
              </Fragment>
            ))}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
