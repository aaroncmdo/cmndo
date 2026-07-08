'use client'
// Admin-Cockpit: Rollup-Matrix (Phase x Owner). Klickbare Zellen -> Drill-in.
// Phase-Header via ClaimMainPhaseBadge (Registry). Heat via semantische Tokens
// (bg-warning-soft = stale, KEIN roher status-scale). Tabelle via shared/DataTable
// (kein rohes HTML-Tabellen-Element). Zellen sind role=button + tastatur-bedienbar.

import { cn } from '@/lib/utils'
import { type ClaimMainPhase } from '@/lib/claims/lifecycle'
import ClaimMainPhaseBadge from '@/components/shared/ClaimMainPhaseBadge'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import type { OpsRollup } from '@/lib/ops/ops-rollup.types'

export interface MatrixSelection {
  phase: ClaimMainPhase
  ownerId: string | null
}

export default function OpsRollupMatrix({
  rollup,
  selected,
  onSelect,
}: {
  rollup: OpsRollup
  selected: MatrixSelection | null
  onSelect: (sel: MatrixSelection | null) => void
}) {
  if (rollup.owners.length === 0) {
    return (
      <p className="py-8 text-center text-body-sm text-claimondo-ondo/70">Keine aktiven Fälle</p>
    )
  }

  const cellMap = new Map<string, { anzahl: number; stale: number }>()
  for (const c of rollup.cells) cellMap.set(`${c.phase}::${c.ownerId ?? ''}`, { anzahl: c.anzahl, stale: c.stale })
  const get = (phase: ClaimMainPhase, ownerId: string | null) =>
    cellMap.get(`${phase}::${ownerId ?? ''}`) ?? { anzahl: 0, stale: 0 }

  const colTotal = (phase: ClaimMainPhase) => rollup.owners.reduce((s, o) => s + get(phase, o.id).anzahl, 0)
  const rowTotal = (ownerId: string | null) => rollup.phases.reduce((s, p) => s + get(p, ownerId).anzahl, 0)
  const isSel = (phase: ClaimMainPhase, ownerId: string | null) =>
    selected?.phase === phase && selected?.ownerId === ownerId

  return (
    <DataTableContainer>
      <Table>
        <Thead>
          <Tr>
            <Th className="normal-case">Owner</Th>
            {rollup.phases.map((p) => (
              <Th key={p} className="text-center normal-case">
                <ClaimMainPhaseBadge mainPhase={p} size="sm" />
              </Th>
            ))}
            <Th className="text-center normal-case">Σ</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rollup.owners.map((o) => (
            <Tr key={o.id ?? 'none'}>
              <Td className="font-medium whitespace-nowrap">{o.name}</Td>
              {rollup.phases.map((p) => {
                const cell = get(p, o.id)
                const sel = isSel(p, o.id)
                const clickable = cell.anzahl > 0
                return (
                  <Td
                    key={p}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-pressed={clickable ? sel : undefined}
                    onClick={clickable ? () => onSelect(sel ? null : { phase: p, ownerId: o.id }) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onSelect(sel ? null : { phase: p, ownerId: o.id })
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      'text-center',
                      clickable && 'cursor-pointer hover:bg-claimondo-bg',
                      cell.stale > 0 && 'bg-warning-soft',
                      sel && 'ring-2 ring-inset ring-claimondo-ondo',
                    )}
                  >
                    {cell.anzahl > 0 ? (
                      <span className="inline-flex flex-col items-center leading-tight">
                        <span
                          className={cn(
                            'text-body-sm font-semibold',
                            cell.stale > 0 && 'text-warning-strong',
                            cell.stale === 0 && 'text-claimondo-navy',
                          )}
                        >
                          {cell.anzahl}
                        </span>
                        {cell.stale > 0 && <span className="text-caption text-warning-strong">{cell.stale} alt</span>}
                      </span>
                    ) : (
                      <span className="text-claimondo-ondo/30">—</span>
                    )}
                  </Td>
                )
              })}
              <Td className="text-center font-semibold text-claimondo-navy">{rowTotal(o.id)}</Td>
            </Tr>
          ))}
          <Tr className="bg-claimondo-bg/50">
            <Td className="font-semibold text-claimondo-navy">Σ</Td>
            {rollup.phases.map((p) => (
              <Td key={p} className="text-center font-semibold text-claimondo-navy">
                {colTotal(p)}
              </Td>
            ))}
            <Td className="text-center font-bold text-claimondo-navy">{rollup.totalAktiv}</Td>
          </Tr>
        </Tbody>
      </Table>
    </DataTableContainer>
  )
}
