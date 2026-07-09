'use client'
// Vertrieb-CRM P1b: der Roster — Triage-KPIs + Segment-Auswahl + Suche + Stufe-Filter +
// Tabelle mit Stufe-Badge. Filter/Sort-Logik in reiner filterKontakte-Fn (getestet).
// shared/DataTable + StatusBadge(domain=vertrieb-workflow) + primitives.Card/Button.
import { useMemo, useState } from 'react'
import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, Button } from '@/components/primitives'
import { filterKontakte } from './_lib/filter-kontakte'
import { collapseByFirma } from './_lib/collapse-firmen'
import { KIND_LABEL } from './_lib/labels'
import VertriebDetailDrawer from './VertriebDetailDrawer'
import {
  ALL_VERTRIEB_STUFEN,
  VERTRIEB_WORKFLOW_DEFS,
  type VertriebStufe,
} from '@/lib/status/domains/vertrieb-workflow'
import type { VertriebKontakt, VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

type Segment = VertriebKind | 'alle'

const SEGMENTE: Segment[] = ['alle', 'sv', 'makler', 'werkstatt', 'partner-lead', 'sv-lead']
const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

export default function VertriebRosterClient({
  kontakte,
  rollup,
}: {
  kontakte: VertriebKontakt[]
  rollup: VertriebRollupZelle[]
}) {
  const [seg, setSeg] = useState<Segment>('alle')
  const [search, setSearch] = useState('')
  const [stufe, setStufe] = useState<VertriebStufe | 'alle'>('alle')
  const [selected, setSelected] = useState<VertriebKontakt | null>(null)
  const gefiltert = useMemo(
    () => filterKontakte(kontakte, { seg, search, stufe }),
    [kontakte, seg, search, stufe],
  )
  // Mehr-Standort-Firmen im Roster zu einer Zeile zusammenfassen (Karte behält alle Filialen).
  const angezeigt = useMemo(() => collapseByFirma(gefiltert), [gefiltert])
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

      <div className="flex flex-wrap gap-2">
        {SEGMENTE.map((s) => (
          <Button key={s} variant={seg === s ? 'navy' : 'ghost'} onClick={() => setSeg(s)}>
            {s === 'alle' ? 'Alle' : KIND_LABEL[s]}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Name, Ort oder E-Mail…"
          aria-label="Suche"
          className={`${FELD_CLS} flex-1 min-w-[220px]`}
        />
        <select
          value={stufe}
          onChange={(e) => setStufe(e.target.value as VertriebStufe | 'alle')}
          aria-label="Nach Stufe filtern"
          className={FELD_CLS}
        >
          <option value="alle">Alle Stufen</option>
          {ALL_VERTRIEB_STUFEN.map((s) => (
            <option key={s} value={s}>
              {VERTRIEB_WORKFLOW_DEFS[s].label}
            </option>
          ))}
        </select>
        <span className="text-caption text-claimondo-ondo/60">
          {angezeigt.length} von {kontakte.length}
        </span>
      </div>

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
            {angezeigt.map((k) => (
              <ClickableTr key={`${k.kind}-${k.id}`} onClick={() => setSelected(k)}>
                <Td>
                  {k.name ?? '—'}
                  {k.standorte > 1 && (
                    <span className="ml-2 text-caption text-claimondo-ondo/60">
                      · {k.standorte} Standorte
                    </span>
                  )}
                </Td>
                <Td>{KIND_LABEL[k.kind]}</Td>
                <Td>
                  <StatusBadge domain="vertrieb-workflow" code={k.stufe} size="sm" />
                </Td>
                <Td>{k.plz ? `${k.plz} ${k.ort ?? ''}`.trim() : k.ort ?? '—'}</Td>
                <Td>{k.email ?? k.telefon ?? '—'}</Td>
              </ClickableTr>
            ))}
            {angezeigt.length === 0 && (
              <Tr>
                <Td colSpan={5}>Keine Einträge — Filter anpassen.</Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>

      <VertriebDetailDrawer kontakt={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
