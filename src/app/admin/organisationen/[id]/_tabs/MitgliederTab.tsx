import Link from 'next/link'
import { UsersIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import type { OrganisationMitglied } from '@/lib/organisationen/queries'

export default function MitgliederTab({ mitglieder }: { mitglieder: OrganisationMitglied[] }) {
  if (mitglieder.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Keine Mitglieder"
        description="Dieser Organisation ist noch kein Sachverständiger zugeordnet."
      />
    )
  }

  return (
    <SectionCard
      title={`Mitglieder (${mitglieder.length})`}
      icon={<UsersIcon className="w-4 h-4 text-claimondo-ondo" />}
      subtitle="Sachverständige dieser Organisation — Klick öffnet das SV-Profil."
      bodyClassName="-mx-5 -mb-5 mt-2"
    >
      <Table>
        <Thead className="text-caption! tracking-wide!">
          <Tr>
            <Th className="text-left">Name</Th>
            <Th className="text-left">E-Mail</Th>
            <Th className="text-left">Paket</Th>
            <Th className="text-left">Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {mitglieder.map((m) => {
            const name = [m.vorname, m.nachname].filter(Boolean).join(' ') || '—'
            return (
              <Tr key={m.id} className="hover:bg-claimondo-bg/50">
                <Td>
                  <Link
                    href={`/admin/vertrieb/sachverstaendige/${m.id}`}
                    className="font-medium text-claimondo-navy hover:text-claimondo-shield transition-colors"
                  >
                    {name}
                  </Link>
                </Td>
                <Td className="text-body-xs text-claimondo-ondo!">{m.email ?? '—'}</Td>
                <Td className="text-body-xs">{m.paket ?? '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge
                      colorCls={
                        m.istAktiv
                          ? 'bg-success-soft text-success-strong'
                          : 'bg-danger-soft text-danger-strong'
                      }
                    >
                      {m.istAktiv ? 'Aktiv' : 'Inaktiv'}
                    </StatusBadge>
                    {m.verifiziert && (
                      <StatusBadge colorCls="bg-claimondo-bg text-claimondo-ondo">
                        Verifiziert
                      </StatusBadge>
                    )}
                  </div>
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
    </SectionCard>
  )
}
