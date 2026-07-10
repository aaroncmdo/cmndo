// Admin-Team-Backlog: offene Reparaturfreigaben ueber alle Werkstaetten. Ergaenzt die
// KB-Eskalation (Push) um die Pull-Sicht. Daten via getAusstehendeFreigaben (Server).

import Link from 'next/link'
import { WrenchIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import type { AusstehendeFreigabe } from '@/lib/werkstatt/ausstehende-freigaben'
import { FreigebenButton } from './FreigebenButton'

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function StatusBadge({ row }: { row: AusstehendeFreigabe }) {
  if (row.ueberfaellig) {
    return <span className="inline-flex rounded-ios-sm bg-danger-soft px-2 py-0.5 text-caption font-medium text-danger-strong">überfällig</span>
  }
  if (row.eskaliert) {
    return <span className="inline-flex rounded-ios-sm bg-warning-soft px-2 py-0.5 text-caption font-medium text-warning-strong">eskaliert</span>
  }
  return <span className="inline-flex rounded-ios-sm bg-info-soft px-2 py-0.5 text-caption font-medium text-info-strong">offen</span>
}

export function AusstehendeFreigabenSection({ rows }: { rows: AusstehendeFreigabe[] }) {
  return (
    <SectionCard
      icon={<WrenchIcon className="w-4 h-4 text-claimondo-ondo/70" />}
      title="Ausstehende Reparaturfreigaben"
      hint={rows.length > 0 ? `${rows.length} offen` : undefined}
    >
      {rows.length === 0 ? (
        <p className="text-body-sm text-claimondo-ondo/70">Aktuell keine ausstehenden Reparaturfreigaben.</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Werkstatt</Th>
              <Th>Kennzeichen</Th>
              <Th>KVA</Th>
              <Th>Kundenbetreuer</Th>
              <Th>fällig</Th>
              <Th>Status</Th>
              <Th><span className="sr-only">Aktion</span></Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.map((row) => (
              <Tr key={row.claim_id}>
                <Td>{row.werkstatt_name ?? '—'}</Td>
                <Td>{row.kennzeichen ?? '—'}</Td>
                <Td>{row.kva_betrag != null ? eur.format(row.kva_betrag) : '—'}</Td>
                <Td>{row.kb_name ?? '—'}</Td>
                <Td>{fmtDate(row.faellig_am)}</Td>
                <Td><StatusBadge row={row} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-3">
                    <FreigebenButton claimId={row.claim_id} />
                    <Link
                      href={`/faelle/${row.fall_id ?? row.claim_id}`}
                      className="text-body-sm font-medium text-claimondo-ondo hover:underline"
                    >
                      Öffnen
                    </Link>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </SectionCard>
  )
}
