'use client'

import { Badge } from '@/components/primitives'
import PageHeader from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

export type KaskoTarifeZeile = {
  id: string
  marke: string
  slug: string
  wbStatus: string
  marker: string[]
  hinweis: string | null
  stand: string
  rechtstraegerVerknuepft: boolean
  tarifeFrei: number
  tarifeGebunden: number
}

function StatusBadge({ s }: { s: string }) {
  if (s === 'keine') return <Badge tone="success" size="sm">keine Bindung</Badge>
  if (s === 'standard') return <Badge tone="warning" size="sm">immer gebunden</Badge>
  return <Badge tone="info" size="sm">optional</Badge>
}

export default function KaskoTarifeTable({ zeilen }: { zeilen: KaskoTarifeZeile[] }) {
  return (
    <div className="p-6">
      <PageHeader
        title="Kasko-Tarife · Werkstattbindung"
        description={`${zeilen.length} Versicherer-Marken (CHECK24-Tarifliste). Pflege über scripts/kasko-wb/ (Seed-Generator), nicht hier.`}
      />
      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Marke</Th><Th>Status</Th><Th>Marker im Tarifnamen</Th><Th>Tarife frei / gebunden</Th><Th>Rechtsträger</Th><Th>Stand</Th>
            </Tr>
          </Thead>
          <Tbody>
            {zeilen.map((z) => (
              <Tr key={z.id}>
                <Td>
                  <span className="font-semibold text-claimondo-navy">{z.marke}</span>
                  {z.hinweis && <span className="block text-caption text-warning-strong">{z.hinweis}</span>}
                </Td>
                <Td><StatusBadge s={z.wbStatus} /></Td>
                <Td>{z.marker.map((m) => `„${m}“`).join(', ') || '–'}</Td>
                <Td>{z.tarifeFrei} / {z.tarifeGebunden}</Td>
                <Td>{z.rechtstraegerVerknuepft ? 'verknüpft' : <span className="text-warning-strong">fehlt</span>}</Td>
                <Td>{z.stand}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
