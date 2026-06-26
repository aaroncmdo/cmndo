'use client'

// Werkstatt-Portal „Meine Vermittlungen": Liste der eigenen KVA-Vermittlungen mit
// Funnel-Status (inkl. Reparatur-Freigabe). Reine Anzeige, leak-safe (keine Kontaktdaten).

import type { WerkstattVermittlung } from '@/lib/werkstatt/queries'
import { vermittlungStatusBadge } from '@/lib/werkstatt/vermittlung-status'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  return DATE.format(new Date(iso))
}

type Props = {
  vermittlungen: WerkstattVermittlung[]
  werkstattName: string
}

export function WerkstattVermittlungen({ vermittlungen, werkstattName }: Props) {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">Meine Vermittlungen</h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihre vermittelten Fälle für {werkstattName} — Status auf einen Blick.
        </p>
      </header>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Kunde</Th>
              <Th>Fahrzeug</Th>
              <Th>KVA</Th>
              <Th>Eingegangen</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {vermittlungen.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="text-center text-claimondo-ondo py-8">
                  Noch keine Vermittlungen vorhanden.
                </Td>
              </Tr>
            ) : (
              vermittlungen.map((v) => {
                const badge = vermittlungStatusBadge(v.status)
                return (
                  <Tr key={v.lead_id}>
                    <Td className="text-claimondo-navy font-medium">{v.kunde_name ?? '–'}</Td>
                    <Td className="text-body-sm">
                      <div className="text-claimondo-navy">{v.fahrzeug ?? '–'}</div>
                      {v.kennzeichen && (
                        <div className="text-claimondo-ondo text-xs font-mono">{v.kennzeichen}</div>
                      )}
                    </Td>
                    <Td className="tabular-nums">
                      {v.kva_betrag != null ? EUR.format(v.kva_betrag) : '–'}
                    </Td>
                    <Td className="text-body-sm">{fmtDate(v.erstellt_am)}</Td>
                    <Td>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-body-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </Td>
                  </Tr>
                )
              })
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
