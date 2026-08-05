import Link from 'next/link'
import { CalendarOffIcon } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { statusSlotClass, type StatusSlot } from '@/lib/status'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import { formatVorZeit } from '@/lib/format/datum'

// kunde-termin-funnel T3 (Task 9): Dispatch-Queue fuer Wunschtermine, die noch
// auf eine SV-Zuweisung warten (gutachter_termine.status in dispatch_pending/
// sv_gesucht). Row-Shape + Kontext-Aufloesung leben im Loader (page.tsx);
// diese Komponente ist reine Praesentation (DataTable-Set, kein handgerolltes
// <table> — Component-Set-Ratchet).

export type TerminwunschRow = {
  id: string
  start_zeit: string
  status: string | null
  created_at: string | null
  ort: string | null
  leadId: string | null
  claimId: string | null
  claimNummer: string | null
  kundeName: string | null
  /** sv_lead (Dead-Pin-Vorschlag, s. reassigniereDeadPin) vs. Kunden-Portal-Wunschtermin. */
  quelle: 'dead_pin' | 'portal'
}

const QUELLE_LABEL: Record<TerminwunschRow['quelle'], string> = {
  dead_pin: 'Dead-Pin',
  portal: 'Portal',
}

const BADGE_CLS = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium'

/** SLA-Alter-Badge: > 24h in der Queue -> danger, sonst pending. Slot-Farbe aus
 *  der zentralen Registry (@/lib/status) — keine rohe Farb-Ternary (Status-Registry-Gate). */
function AlterBadge({ createdAt }: { createdAt: string | null }) {
  if (!createdAt) {
    return <span className={`${BADGE_CLS} ${statusSlotClass('neutral')}`}>—</span>
  }
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000
  const slot: StatusSlot = ageHours > 24 ? 'danger' : 'pending'
  return <span className={`${BADGE_CLS} ${statusSlotClass(slot)}`}>{formatVorZeit(createdAt)}</span>
}

export default function TerminwunschListe({ rows }: { rows: TerminwunschRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarOffIcon}
        title="Keine offenen Terminwünsche"
        description="Neue Wunschtermine aus dem Kunden-Funnel erscheinen hier, sobald sie auf eine SV-Zuweisung warten."
      />
    )
  }

  return (
    <DataTableContainer>
      <Table>
        <Thead>
          <Tr>
            <Th>Alter</Th>
            <Th>Wunschzeit</Th>
            <Th>Kunde / Ort</Th>
            <Th>Fall</Th>
            <Th>Quelle</Th>
            <Th>Aktionen</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td>
                <AlterBadge createdAt={row.created_at} />
              </Td>
              <Td className="tabular-nums whitespace-nowrap">
                {formatBerlin(row.start_zeit, {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Td>
              <Td>
                <div className="flex flex-col">
                  {row.leadId ? (
                    <Link
                      href={`/dispatch/leads/${row.leadId}`}
                      className="font-medium text-claimondo-navy hover:text-claimondo-ondo"
                    >
                      {row.kundeName ?? 'Lead'}
                    </Link>
                  ) : (
                    <span className="font-medium text-claimondo-navy">{row.kundeName ?? '—'}</span>
                  )}
                  {row.ort && <span className="text-body-xs text-claimondo-ondo">{row.ort}</span>}
                </div>
              </Td>
              <Td>
                {row.claimId ? (
                  <Link
                    href={`/faelle/${row.claimId}`}
                    className="text-claimondo-navy hover:text-claimondo-ondo"
                  >
                    {row.claimNummer ?? row.claimId}
                  </Link>
                ) : (
                  <span className="text-claimondo-ondo">—</span>
                )}
              </Td>
              <Td className="text-claimondo-ondo">{QUELLE_LABEL[row.quelle]}</Td>
              <Td>{/* T3 Task 10: Aktionen */}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </DataTableContainer>
  )
}
