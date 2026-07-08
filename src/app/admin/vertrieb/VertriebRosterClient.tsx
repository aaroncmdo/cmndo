'use client'
// Vertrieb-CRM P1a: der Roster — Triage-KPIs (aus rollup) + kind-Segment-Tabs + Tabelle
// mit Stufe-Badge. Read-only. shared/DataTable + StatusBadge(domain=vertrieb-workflow) +
// primitives.Card (kein handgerolltes Card). Housing/Kanban/Filter/Detail = spaetere Inkremente.
import { useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card } from '@/components/primitives'
import type { VertriebKontakt, VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

type Segment = VertriebKind | 'alle'

const KIND_LABEL: Record<Segment, string> = {
  alle: 'Alle',
  sv: 'Sachverständige',
  makler: 'Makler',
  werkstatt: 'Werkstätten',
  'partner-lead': 'Partner-Leads',
  'sv-lead': 'SV-Leads',
}
const SEGMENTE: Segment[] = ['alle', 'sv', 'makler', 'werkstatt', 'partner-lead', 'sv-lead']

export default function VertriebRosterClient({
  kontakte,
  rollup,
}: {
  kontakte: VertriebKontakt[]
  rollup: VertriebRollupZelle[]
}) {
  const [seg, setSeg] = useState<Segment>('alle')
  const gefiltert = useMemo(
    () => (seg === 'alle' ? kontakte : kontakte.filter((k) => k.kind === seg)),
    [kontakte, seg],
  )
  const kpi = useMemo(() => {
    const sum = (pred: (z: VertriebRollupZelle) => boolean) =>
      rollup.filter(pred).reduce((a, z) => a + z.anzahl, 0)
    return {
      Leads: sum((z) => z.kind === 'partner-lead' || z.kind === 'sv-lead'),
      Onboarding: sum((z) => z.stufe === 'onboarding'),
      Aktiv: sum((z) => z.stufe === 'aktiv'),
      Gesperrt: sum((z) => z.stufe === 'gesperrt'),
    }
  }, [rollup])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(kpi).map(([label, n]) => (
          <Card key={label} p={4} radius="lg">
            <p className="text-caption text-claimondo-ondo/70">{label}</p>
            <p className="text-heading-md text-claimondo-navy">{n}</p>
          </Card>
        ))}
      </div>

      <Tabs value={seg} onValueChange={(v) => setSeg(v as Segment)} className="w-full">
        <TabsList variant="default" className="w-full overflow-x-auto bg-claimondo-navy/[0.06]">
          {SEGMENTE.map((s) => (
            <TabsTrigger key={s} value={s}>
              {KIND_LABEL[s]}
            </TabsTrigger>
          ))}
        </TabsList>
        {SEGMENTE.map((s) => (
          <TabsContent key={s} value={s} className="pt-4">
            <DataTableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Typ</Th>
                    <Th>Stufe</Th>
                    <Th>Ort</Th>
                    <Th>Kontakt</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {gefiltert.map((k) => (
                    <Tr key={`${k.kind}-${k.id}`}>
                      <Td>{k.name ?? '—'}</Td>
                      <Td>{KIND_LABEL[k.kind]}</Td>
                      <Td>
                        <StatusBadge domain="vertrieb-workflow" code={k.stufe} size="sm" />
                      </Td>
                      <Td>{k.plz ? `${k.plz} ${k.ort ?? ''}`.trim() : k.ort ?? '—'}</Td>
                      <Td>{k.email ?? k.telefon ?? '—'}</Td>
                    </Tr>
                  ))}
                  {gefiltert.length === 0 && (
                    <Tr>
                      <Td>Keine Einträge in diesem Segment.</Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </DataTableContainer>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
