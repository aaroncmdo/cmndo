'use client'

// Werkstatt-Portal „Aufträge": vermittelte + inbound Aufträge mit Gutachter,
// Besichtigungstermin und Fahrzeug. Quelle: v_werkstatt_auftrag (RLS-gegatet).

import type { WerkstattAuftrag } from '@/lib/werkstatt/queries'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const DATETIME = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
})

function fmtTermin(iso: string | null): string {
  if (!iso) return 'Noch offen'
  return `${DATETIME.format(new Date(iso))} Uhr`
}

function fahrzeugText(a: WerkstattAuftrag): string {
  const parts = [a.fahrzeug_hersteller, a.fahrzeug_modell].filter(Boolean)
  return parts.length ? parts.join(' ') : '–'
}

const RICHTUNG_LABEL: Record<string, string> = {
  vermittelt: 'Vermittelt',
  inbound: 'Eigener Kunde',
}

const OP_STATUS_LABEL: Record<string, string> = {
  ersterfassung: 'In Erfassung',
  'sv-termin': 'Gutachter-Termin',
}

function opStatusLabel(s: string | null): string {
  if (!s) return '–'
  return OP_STATUS_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')
}

type Props = {
  auftraege: WerkstattAuftrag[]
  werkstattName: string
}

export function WerkstattAuftraege({ auftraege, werkstattName }: Props) {
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">Aufträge</h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihre Aufträge für {werkstattName} — mit Gutachter und Besichtigungstermin.
        </p>
      </header>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Auftrag</Th>
              <Th>Fahrzeug</Th>
              <Th>Schaden</Th>
              <Th>Gutachter</Th>
              <Th>Besichtigung</Th>
              <Th>Status</Th>
              <Th>Provision</Th>
            </Tr>
          </Thead>
          <Tbody>
            {auftraege.length === 0 ? (
              <Tr>
                <Td colSpan={7} className="text-center text-claimondo-ondo py-8">
                  Noch keine Aufträge vorhanden. Sobald Ihnen ein Auftrag zugewiesen wird,
                  erscheinen hier Fahrzeug, Gutachter und Besichtigungstermin.
                </Td>
              </Tr>
            ) : (
              auftraege.map((a) => (
                <Tr key={a.claim_id}>
                  <Td>
                    <div className="text-claimondo-navy font-medium">{a.claim_nummer ?? '–'}</div>
                    {a.richtung && (
                      <div className="text-claimondo-ondo text-xs">
                        {RICHTUNG_LABEL[a.richtung] ?? a.richtung}
                      </div>
                    )}
                  </Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{fahrzeugText(a)}</div>
                    {a.kennzeichen && (
                      <div className="text-claimondo-ondo text-xs font-mono">{a.kennzeichen}</div>
                    )}
                  </Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{a.schadenart ?? '–'}</div>
                    {a.reparaturwunsch && (
                      <div className="text-claimondo-ondo text-xs">{a.reparaturwunsch}</div>
                    )}
                  </Td>
                  <Td className="text-body-sm text-claimondo-navy">
                    {a.gutachter_firmenname ?? '–'}
                  </Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{fmtTermin(a.besichtigung_start)}</div>
                    {a.besichtigung_ort && (
                      <div className="text-claimondo-ondo text-xs">{a.besichtigung_ort}</div>
                    )}
                  </Td>
                  <Td>
                    {a.operative_status && (
                      <span className="inline-flex items-center rounded-full bg-claimondo-bg px-2.5 py-1 text-body-xs font-semibold text-claimondo-navy">
                        {opStatusLabel(a.operative_status)}
                      </span>
                    )}
                  </Td>
                  <Td className="tabular-nums text-body-sm text-claimondo-navy">
                    {a.provision_betrag_netto != null ? EUR.format(a.provision_betrag_netto) : '–'}
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
