'use client'

// Werkstatt-Portal „Reparatur-Aufträge": Fälle, die dieser Werkstatt zur Reparatur zugewiesen
// wurden (Outbound-Vermittlung). Reine Anzeige, leak-safe (kein Kunden-Kontakt — der Kunde
// wurde mit der Werkstatt-Info benachrichtigt und meldet sich).

import type { WerkstattReparaturAuftrag } from '@/lib/werkstatt/reparatur-auftraege'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE.format(new Date(iso))
}

const QUELLE_LABEL: Record<string, string> = {
  dispatcher: 'Dispatcher',
  kunde: 'Kunde',
  embed: 'Partner-Website',
}

type Props = {
  auftraege: WerkstattReparaturAuftrag[]
  werkstattName: string
}

export function WerkstattReparaturAuftraege({ auftraege, werkstattName }: Props) {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">Reparatur-Aufträge</h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihnen zur Reparatur zugewiesene Fälle für {werkstattName}. Der Kunde wurde über Ihre Werkstatt
          informiert und meldet sich bei Ihnen.
        </p>
      </header>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Kunde</Th>
              <Th>Fahrzeug</Th>
              <Th>Ort</Th>
              <Th>Quelle</Th>
              <Th>Zugewiesen</Th>
            </Tr>
          </Thead>
          <Tbody>
            {auftraege.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="text-center text-claimondo-ondo py-8">
                  Noch keine zugewiesenen Reparatur-Aufträge.
                </Td>
              </Tr>
            ) : (
              auftraege.map((a) => (
                <Tr key={a.claim_id}>
                  <Td className="text-claimondo-navy font-medium">{a.kunde_name ?? '–'}</Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{a.fahrzeug ?? '–'}</div>
                    {a.kennzeichen && (
                      <div className="text-claimondo-ondo text-xs font-mono">{a.kennzeichen}</div>
                    )}
                  </Td>
                  <Td className="text-body-sm">{a.ort ?? '–'}</Td>
                  <Td className="text-body-sm">{a.quelle ? (QUELLE_LABEL[a.quelle] ?? a.quelle) : '–'}</Td>
                  <Td className="text-body-sm">{fmtDate(a.zugewiesen_am)}</Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
