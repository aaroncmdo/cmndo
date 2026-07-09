'use client'
// Vertrieb-CRM P2: Switch-Ansicht — Typ-Switch [Alle·Leads·Partner] + Rolle-Filter
// [Alle·SV·Makler·Werkstatt] + Suche/Stufe + Liste/Karte-Toggle. Eine Ansicht über
// Leads UND Partner, rollen-filterbar; die Karte folgt dem Filter (Farbe = Rolle).
// Filter/Sort in reiner filterKontakte-Fn; Firmen-Collapse nur in der Liste (Karte behält Filialen).
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, Button } from '@/components/primitives'
import { filterKontakte } from './_lib/filter-kontakte'
import { collapseByFirma } from './_lib/collapse-firmen'
import { ROLLE_LABEL, TYP_LABEL } from './_lib/labels'
import VertriebDetailDrawer from './VertriebDetailDrawer'
import VertriebKarteClient from './karte/VertriebKarteClient'
import {
  ALL_VERTRIEB_STUFEN,
  VERTRIEB_WORKFLOW_DEFS,
  type VertriebStufe,
} from '@/lib/status/domains/vertrieb-workflow'
import type { VertriebKontakt, VertriebTyp, VertriebRolle } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

const TYP_SWITCH: { key: VertriebTyp | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'lead', label: 'Leads' },
  { key: 'partner', label: 'Partner' },
]
const ROLLE_FILTER: { key: VertriebRolle | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle Rollen' },
  { key: 'sv', label: 'Sachverständige' },
  { key: 'makler', label: 'Makler' },
  { key: 'werkstatt', label: 'Werkstätten' },
]
// P3b: Vertrieb-Rolle -> partner_leads.rolle (für den role-aware Prefill des gemounteten CRM).
const ROLLE_TO_PL: Record<VertriebRolle, string> = {
  sv: 'sachverstaendiger',
  makler: 'makler',
  werkstatt: 'werkstatt',
}
const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

export default function VertriebRosterClient({
  kontakte,
  rollup,
}: {
  kontakte: VertriebKontakt[]
  rollup: VertriebRollupZelle[]
}) {
  const [typ, setTyp] = useState<VertriebTyp | 'alle'>('alle')
  const [rolle, setRolle] = useState<VertriebRolle | 'alle'>('alle')
  const [ansicht, setAnsicht] = useState<'liste' | 'karte'>('liste')
  const [search, setSearch] = useState('')
  const [stufe, setStufe] = useState<VertriebStufe | 'alle'>('alle')
  const [selected, setSelected] = useState<VertriebKontakt | null>(null)
  const router = useRouter()

  // P3b: „Neue Leads" role-aware ins gemountete partner_leads-CRM (Rolle vorbelegt).
  function neueLeads(aktion: 'scrapen' | 'csv') {
    const params = new URLSearchParams({ aktion })
    if (rolle !== 'alle') params.set('rolle', ROLLE_TO_PL[rolle])
    router.push(`/admin/vertrieb/partner-leads?${params.toString()}`)
  }

  const gefiltert = useMemo(
    () => filterKontakte(kontakte, { typ, rolle, search, stufe }),
    [kontakte, typ, rolle, search, stufe],
  )
  // Liste: Mehr-Standort-Firmen zusammenfassen. Karte nutzt gefiltert (behält Filialen).
  const angezeigt = useMemo(() => collapseByFirma(gefiltert), [gefiltert])
  const kpi = useMemo(() => {
    const sum = (pred: (z: VertriebRollupZelle) => boolean) =>
      rollup.filter(pred).reduce((a, z) => a + z.anzahl, 0)
    return {
      Leads: sum((z) => z.kind === 'partner-lead'),
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

      {/* Typ-Switch + Liste/Karte-Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {TYP_SWITCH.map((t) => (
          <Button key={t.key} variant={typ === t.key ? 'navy' : 'ghost'} onClick={() => setTyp(t.key)}>
            {t.label}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant={ansicht === 'liste' ? 'navy' : 'ghost'} size="sm" onClick={() => setAnsicht('liste')}>
            Liste
          </Button>
          <Button variant={ansicht === 'karte' ? 'navy' : 'ghost'} size="sm" onClick={() => setAnsicht('karte')}>
            Karte
          </Button>
        </div>
      </div>

      {/* Rolle-Filter */}
      <div className="flex flex-wrap gap-2">
        {ROLLE_FILTER.map((r) => (
          <Button key={r.key} variant={rolle === r.key ? 'navy' : 'ghost'} size="sm" onClick={() => setRolle(r.key)}>
            {r.label}
          </Button>
        ))}
      </div>

      {/* P3b: Neue Leads role-aware ins gemountete CRM (Rolle vorbelegt) — nur im Leads-Modus */}
      {typ === 'lead' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-claimondo-ondo/70">Neue Leads:</span>
          <Button variant="ghost" size="sm" onClick={() => neueLeads('scrapen')}>
            Scrapen (Google Places)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => neueLeads('csv')}>
            CSV importieren
          </Button>
        </div>
      )}

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
          {ansicht === 'liste' ? angezeigt.length : gefiltert.length} von {kontakte.length}
        </span>
      </div>

      {ansicht === 'liste' ? (
        <DataTableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Rolle</Th>
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
                    {k.typ === 'lead' && (
                      <span className="ml-2 text-caption text-claimondo-ondo/60">· {TYP_LABEL.lead}</span>
                    )}
                    {k.standorte > 1 && (
                      <span className="ml-2 text-caption text-claimondo-ondo/60">· {k.standorte} Standorte</span>
                    )}
                  </Td>
                  <Td>{ROLLE_LABEL[k.rolle]}</Td>
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
      ) : (
        <div className="h-[70vh] rounded-ios-lg overflow-hidden border border-claimondo-border">
          <VertriebKarteClient kontakte={gefiltert} />
        </div>
      )}

      <VertriebDetailDrawer kontakt={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
