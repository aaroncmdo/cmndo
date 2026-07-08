'use client'
// Admin-Cockpit (Ops-Rollup): Workflow-KPIs + Phase-x-Owner-Matrix + Klick-Drill-in +
// "Braucht Aufmerksamkeit" (ueberfaellig). Matrix aus der abgeleiteten v_ops_rollup,
// Drill-in/Attention aus den WorkItems (praezises TS-isOverdue). WorkItemCard teilt
// Hover-Edit + Phasen-Override mit dem KB-Board -> Admin ist voll editierbar.

import { useState } from 'react'
import { MAIN_PHASE_LABEL } from '@/lib/claims/lifecycle'
import { cn } from '@/lib/utils'
import { Card, Button } from '@/components/primitives'
import type { ClaimWorkItem } from '@/lib/ops/claim-workstate.types'
import type { OpsRollup } from '@/lib/ops/ops-rollup.types'
import OpsRollupMatrix, { type MatrixSelection } from './OpsRollupMatrix'
import WorkItemCard from '@/components/ops/WorkItemCard'

function KpiCell({
  label,
  value,
  danger,
  warning,
}: {
  label: string
  value: number
  danger?: boolean
  warning?: boolean
}) {
  return (
    <Card p={3} className="flex flex-col gap-0.5">
      <span className="text-caption text-claimondo-ondo/70">{label}</span>
      <span
        className={cn(
          'text-heading-md font-bold text-claimondo-navy',
          danger && 'text-danger-strong',
          warning && 'text-warning-strong',
        )}
      >
        {value}
      </span>
    </Card>
  )
}

export default function AdminOpsCockpit({ rollup, items }: { rollup: OpsRollup; items: ClaimWorkItem[] }) {
  const [selected, setSelected] = useState<MatrixSelection | null>(null)

  const nameById = new Map(rollup.owners.map((o) => [o.id, o.name] as const))
  const nameOf = (id: string | null) => nameById.get(id) ?? (id ? id.slice(0, 8) : 'Nicht zugewiesen')

  const overdue = items
    .filter((i) => i.isOverdue)
    .sort((a, b) => (b.overdueSinceDays ?? 0) - (a.overdueSinceDays ?? 0))
  const unassigned = items.filter((i) => !i.kundenbetreuerId).length

  // Ueberfaellige je Zelle (TS-isOverdue) -> Matrix-Heat konsistent zur Attention-Liste.
  const overdueByCell = new Map<string, number>()
  for (const i of overdue) {
    const key = `${i.stage}::${i.kundenbetreuerId ?? ''}`
    overdueByCell.set(key, (overdueByCell.get(key) ?? 0) + 1)
  }

  const drill = selected
    ? items.filter((i) => i.stage === selected.phase && i.kundenbetreuerId === selected.ownerId)
    : []

  return (
    <div className="space-y-4">
      {/* Workflow-KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCell label="Aktive Fälle" value={items.length} />
        <KpiCell label="Überfällig" value={overdue.length} danger={overdue.length > 0} />
        <KpiCell label="Nicht zugewiesen" value={unassigned} warning={unassigned > 0} />
      </div>

      {/* Rollup-Matrix (abgeleitete v_ops_rollup) */}
      <div>
        <h2 className="mb-2 text-body-sm font-semibold text-claimondo-navy">Fälle nach Phase &amp; Owner</h2>
        <OpsRollupMatrix rollup={rollup} selected={selected} onSelect={setSelected} overdueByCell={overdueByCell} />
        <p className="mt-1.5 text-caption text-claimondo-ondo/60">
          Zelle anklicken für Details · gelb = überfällige Fälle (SLA)
        </p>
      </div>

      {/* Drill-in (gewaehlte Zelle) */}
      {selected && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-body-sm font-semibold text-claimondo-navy">
              {MAIN_PHASE_LABEL[selected.phase]} · {nameOf(selected.ownerId)} ({drill.length})
            </h2>
            <Button type="button" variant="bare" size="sm" onClick={() => setSelected(null)}>
              Auswahl aufheben
            </Button>
          </div>
          {drill.length === 0 ? (
            <p className="text-body-sm text-claimondo-ondo/70">Keine Fälle in dieser Auswahl.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {drill.map((i) => (
                <WorkItemCard key={i.id} item={i} ownerName={nameOf(i.kundenbetreuerId)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Braucht Aufmerksamkeit (ueberfaellig, sortiert) */}
      <div>
        <h2 className="mb-2 text-body-sm font-semibold text-claimondo-navy">Braucht Aufmerksamkeit</h2>
        {overdue.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo/70">Nichts Überfälliges 🎉</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {overdue.slice(0, 9).map((i) => (
              <WorkItemCard key={i.id} item={i} ownerName={nameOf(i.kundenbetreuerId)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
