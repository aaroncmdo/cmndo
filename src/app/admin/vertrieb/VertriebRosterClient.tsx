'use client'
// Vertrieb-Cockpit: EINE Übersicht über Leads UND Partner. Rollen-Pills + Lead/Partner-Schalter
// (VertriebPillBar) ersetzen die frühere Tab-Nav; die kontextuelle Aktions-Leiste zeigt je Pill
// die passenden Aktionen. KPIs sind rollen-gescopet (computeContextKpis, DB-Daten). Filter/Sort
// in reiner filterKontakte-Fn; Firmen-Collapse nur in der Liste (Karte behält Filialen).
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, Button } from '@/components/primitives'
import { filterKontakte } from './_lib/filter-kontakte'
import { collapseByFirma } from './_lib/collapse-firmen'
import { computeContextKpis } from './_lib/context-kpis'
import { ROLLE_LABEL, TYP_LABEL } from './_lib/labels'
import VertriebPillBar from './VertriebPillBar'
import VertriebAktionsleiste from './VertriebAktionsleiste'
import FirmenFlottenCockpitEntry from './FirmenFlottenCockpitEntry'
import VertriebDetailDrawer from './VertriebDetailDrawer'
import VertriebKarteClient from './karte/VertriebKarteClient'
import VertriebLiveOpsListe from './live-ops/VertriebLiveOpsListe'
import LiveOpsMap from '@/components/live-ops/LiveOpsMap'
import type { LiveOpsData } from '@/components/live-ops/types'
import type { LiveOpsRole } from '@/lib/live-ops/types'
import {
  ALL_VERTRIEB_STUFEN,
  VERTRIEB_WORKFLOW_DEFS,
  type VertriebStufe,
} from '@/lib/status/domains/vertrieb-workflow'
import type { VertriebKontakt, VertriebTyp, VertriebRolle } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebRollupZelle } from '@/lib/vertrieb/vertrieb-rollup.types'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

export default function VertriebRosterClient({
  kontakte,
  liveOps,
  liveOpsRole,
}: {
  kontakte: VertriebKontakt[]
  // rollup bleibt im Caller-Vertrag (getVertriebDaten liefert es), wird aber nicht mehr
  // gebraucht — KPIs kommen jetzt aus computeContextKpis(kontakte, rolle).
  rollup?: VertriebRollupZelle[]
  // Live-Ops-Daten (SV-Karte + -Liste). Nur bei rolle=SV konsumiert; sonst ungenutzt.
  liveOps: LiveOpsData
  liveOpsRole: LiveOpsRole
}) {
  const router = useRouter()
  const [typ, setTyp] = useState<VertriebTyp | 'alle'>('alle')
  const [rolle, setRolle] = useState<VertriebRolle | 'alle'>('alle')
  const [ansicht, setAnsicht] = useState<'liste' | 'karte' | 'liveops'>('liste')
  const [search, setSearch] = useState('')
  const [stufe, setStufe] = useState<VertriebStufe | 'alle'>('alle')
  const [selected, setSelected] = useState<VertriebKontakt | null>(null)

  const gefiltert = useMemo(
    () => filterKontakte(kontakte, { typ, rolle, search, stufe }),
    [kontakte, typ, rolle, search, stufe],
  )
  // Liste: Mehr-Standort-Firmen zusammenfassen. Karte nutzt gefiltert (behält Filialen).
  const angezeigt = useMemo(() => collapseByFirma(gefiltert), [gefiltert])
  // KPIs rollen-gescopet auf die aktive Pill (DB-Daten, client-seitig gezählt).
  const kpi = useMemo(() => computeContextKpis(kontakte, rolle), [kontakte, rolle])
  // Live-Ops-Ansicht gibt es nur fuer SV; wechselt die Rolle weg, faellt sie auf Liste zurueck
  // (rein abgeleitet, kein Effect -> kein Stuck-State).
  const effAnsicht = ansicht === 'liveops' && rolle !== 'sv' ? 'liste' : ansicht

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpi.map(({ label, wert }) => (
          <Card key={label} p={4} radius="lg">
            <p className="text-caption text-claimondo-ondo/70">{label}</p>
            <p className="text-heading-md text-claimondo-navy">{wert}</p>
          </Card>
        ))}
      </div>

      {/* Rollen-Pills + Lead/Partner-Schalter + Liste/Karte/Live-Ops-Toggle */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <VertriebPillBar rolle={rolle} setRolle={setRolle} typ={typ} setTyp={setTyp} />
        <div className="flex items-center gap-2">
          {/* Globaler B2B-Einstieg (kein Pill, immer sichtbar) — durch einen Teiler von den
              Ansichts-Togglern getrennt, damit er nicht wie ein 4. View-Modus wirkt. */}
          <FirmenFlottenCockpitEntry />
          <span className="w-px h-5 bg-claimondo-border" aria-hidden />
          <Button variant={effAnsicht === 'liste' ? 'navy' : 'ghost'} size="sm" onClick={() => setAnsicht('liste')}>
            Liste
          </Button>
          <Button variant={effAnsicht === 'karte' ? 'navy' : 'ghost'} size="sm" onClick={() => setAnsicht('karte')}>
            Karte
          </Button>
          {rolle === 'sv' && (
            <Button
              variant={effAnsicht === 'liveops' ? 'navy' : 'ghost'}
              size="sm"
              onClick={() => setAnsicht('liveops')}
            >
              Live-Ops
            </Button>
          )}
        </div>
      </div>

      {/* Kontextuelle Aktions-Leiste (je Pill × Lead/Partner) */}
      <VertriebAktionsleiste rolle={rolle} typ={typ} />

      {effAnsicht !== 'liveops' && (
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
            {effAnsicht === 'liste' ? angezeigt.length : gefiltert.length} von {kontakte.length}
          </span>
        </div>
      )}

      {effAnsicht === 'liste' && (
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
      )}

      {effAnsicht === 'karte' &&
        (rolle === 'sv' ? (
          <div className="h-[78vh] rounded-ios-lg overflow-hidden border border-claimondo-border">
            <LiveOpsMap
              role={liveOpsRole}
              data={liveOps}
              onRefresh={() => router.refresh()}
              svHrefBase="/admin/vertrieb/sachverstaendige"
            />
          </div>
        ) : (
          <div className="h-[70vh] rounded-ios-lg overflow-hidden border border-claimondo-border">
            <VertriebKarteClient kontakte={gefiltert} />
          </div>
        ))}

      {effAnsicht === 'liveops' && (
        <VertriebLiveOpsListe svs={liveOps.svs} termine={liveOps.termine} />
      )}

      <VertriebDetailDrawer kontakt={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
