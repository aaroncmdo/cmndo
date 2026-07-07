'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives/Button'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import { graduiereTyp, zuruecksetzenTyp } from '@/app/admin/ai-vorschlaege/actions'
import type { TypeStats } from '@/lib/orchestrator/types'

const TYP_LABEL: Record<string, string> = {
  task: 'Aufgabe',
  escalation: 'Eskalation',
  next_step: 'Nächster Schritt',
}

const ROLLE_LABEL: Record<string, string> = {
  sachverstaendiger: 'Sachverständiger',
  kundenbetreuer: 'Kundenbetreuer',
  admin: 'Admin',
}

function ModusChip({ mode }: { mode: 'manual' | 'auto' }) {
  if (mode === 'auto') {
    return (
      <span className="inline-flex items-center rounded-ios-sm px-2 py-0.5 text-caption font-semibold bg-success-soft text-success-strong">
        Auto
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-ios-sm px-2 py-0.5 text-caption font-semibold bg-claimondo-bg text-claimondo-ondo">
      Manuell
    </span>
  )
}

function AktionsZelle({ row }: { row: TypeStats }) {
  const [isPending, startTransition] = useTransition()

  const handleGraduieren = () => {
    startTransition(async () => {
      const r = await graduiereTyp(row.vorschlagTyp, row.zielRolle ?? '')
      if (r.ok) toast.success('Typ graduiert — Auto-Modus aktiv')
      else toast.error(r.error ?? 'Fehler beim Graduieren')
    })
  }

  const handleZuruecksetzen = () => {
    startTransition(async () => {
      const r = await zuruecksetzenTyp(row.vorschlagTyp, row.zielRolle ?? '')
      if (r.ok) toast.success('Zurückgesetzt auf manuellen Modus')
      else toast.error(r.error ?? 'Fehler beim Zurücksetzen')
    })
  }

  // escalation/next_step dürfen nie graduiert werden (Compliance §7)
  const kannGraduieren = row.vorschlagTyp === 'task'

  if (row.mode === 'auto') {
    return (
      <Button
        variant="ghost"
        size="sm"
        loading={isPending}
        onClick={handleZuruecksetzen}
      >
        Zurücksetzen
      </Button>
    )
  }

  return (
    <Button
      variant="navy"
      size="sm"
      loading={isPending}
      disabled={!kannGraduieren || !row.ready}
      onClick={handleGraduieren}
    >
      Graduieren
    </Button>
  )
}

export function GraduierungPanel({ stats }: { stats: TypeStats[] }) {
  if (stats.length === 0) {
    return (
      <p className="text-body-sm text-claimondo-ondo">
        Noch keine Entscheidungsdaten — bitte warten bis der Orchestrator Vorschläge gesammelt hat.
      </p>
    )
  }

  return (
    <DataTableContainer variant="card">
      <Table>
        <Thead>
          <Tr>
            <Th>Typ</Th>
            <Th>Zielrolle</Th>
            <Th>Quote</Th>
            <Th>Entscheidungen</Th>
            <Th>Modus</Th>
            <Th>Aktion</Th>
          </Tr>
        </Thead>
        <Tbody>
          {stats.map((row) => {
            const key = `${row.vorschlagTyp}|${row.zielRolle ?? ''}`
            const quoteProzent = `${Math.round(row.quote * 100)} %`
            return (
              <Tr key={key}>
                <Td className="font-medium">
                  {TYP_LABEL[row.vorschlagTyp] ?? row.vorschlagTyp}
                </Td>
                <Td>
                  {row.zielRolle
                    ? (ROLLE_LABEL[row.zielRolle] ?? row.zielRolle)
                    : '—'}
                </Td>
                <Td>
                  <span
                    className={
                      row.ready
                        ? 'font-semibold text-success-strong'
                        : 'text-claimondo-navy'
                    }
                  >
                    {quoteProzent}
                  </span>
                </Td>
                <Td>{row.entscheidungen}</Td>
                <Td>
                  <ModusChip mode={row.mode} />
                </Td>
                <Td>
                  <AktionsZelle row={row} />
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
    </DataTableContainer>
  )
}
