import Link from 'next/link'
import { FolderOpenIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'
import FallStatusBadge from '@/components/shared/FallStatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import type { VersichererFall } from '@/lib/versicherungen/queries'

export default function FaelleTab({ faelle }: { faelle: VersichererFall[] }) {
  if (faelle.length === 0) {
    return (
      <EmptyState
        icon={FolderOpenIcon}
        title="Keine Fälle"
        description="Dieser Versicherer ist in keinem Fall als Gegner hinterlegt."
      />
    )
  }

  return (
    <SectionCard
      title={`Fälle (${faelle.length})`}
      icon={<FolderOpenIcon className="w-4 h-4 text-claimondo-ondo" />}
      subtitle="Fälle, in denen dieser Versicherer der Gegner ist — Klick öffnet die Fallakte."
      bodyClassName="-mx-5 -mb-5 mt-2"
    >
      <Table>
        <Thead className="text-caption! tracking-wide!">
          <Tr>
            <Th className="text-left">Fall</Th>
            <Th className="text-left">Status</Th>
            <Th className="text-left">Angelegt</Th>
          </Tr>
        </Thead>
        <Tbody>
          {faelle.map((f) => (
            <Tr key={f.id} className="hover:bg-claimondo-bg/50">
              <Td>
                <Link
                  href={`/faelle/${f.id}`}
                  className="font-medium font-mono text-claimondo-navy hover:text-claimondo-shield transition-colors"
                >
                  {f.claimNummer ?? f.id.slice(0, 8)}
                </Link>
              </Td>
              <Td>{f.status ? <FallStatusBadge status={f.status} size="xs" /> : '—'}</Td>
              <Td className="text-body-xs text-claimondo-ondo!">
                {new Date(f.createdAt).toLocaleDateString('de-DE')}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </SectionCard>
  )
}
