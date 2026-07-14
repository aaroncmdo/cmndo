import Link from 'next/link'
import { MailIcon, ArrowUpRightIcon, ArrowDownLeftIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import type { VersichererKorrespondenz } from '@/lib/versicherungen/queries'

export default function KorrespondenzTab({
  korrespondenz,
}: {
  korrespondenz: VersichererKorrespondenz[]
}) {
  if (korrespondenz.length === 0) {
    return (
      <EmptyState
        icon={MailIcon}
        title="Keine Korrespondenz"
        description="Mit diesem Versicherer wurde noch kein Schriftverkehr erfasst."
      />
    )
  }

  return (
    <SectionCard
      title={`VS-Korrespondenz (${korrespondenz.length})`}
      icon={<MailIcon className="w-4 h-4 text-claimondo-ondo" />}
      subtitle="Schriftverkehr über alle Fälle hinweg — bisher nur pro Fall sichtbar, hier gebündelt."
      bodyClassName="-mx-5 -mb-5 mt-2"
    >
      <Table>
        <Thead className="text-caption! tracking-wide!">
          <Tr>
            <Th className="text-left">Datum</Th>
            <Th className="text-left">Richtung</Th>
            <Th className="text-left">Betreff</Th>
            <Th className="text-left">Aktenzeichen</Th>
            <Th className="text-left">Frist</Th>
            <Th className="text-left">Fall</Th>
          </Tr>
        </Thead>
        <Tbody>
          {korrespondenz.map((k) => {
            const eingehend = k.richtung === 'eingehend'
            const RichtungIcon = eingehend ? ArrowDownLeftIcon : ArrowUpRightIcon
            return (
              <Tr key={k.id} className="hover:bg-claimondo-bg/50">
                <Td className="text-body-xs whitespace-nowrap">
                  {new Date(k.datum).toLocaleDateString('de-DE')}
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1 text-body-xs text-claimondo-ondo">
                    <RichtungIcon className="w-3.5 h-3.5" />
                    {eingehend ? 'Eingehend' : 'Ausgehend'}
                  </span>
                </Td>
                <Td className="text-body-xs text-claimondo-navy">{k.betreff ?? k.typ ?? '—'}</Td>
                <Td className="text-body-xs font-mono text-claimondo-ondo!">
                  {k.aktenzeichen ?? '—'}
                </Td>
                <Td>
                  {k.naechsteFrist ? (
                    <StatusBadge
                      colorCls={
                        new Date(k.naechsteFrist) < new Date()
                          ? 'bg-danger-soft text-danger-strong'
                          : 'bg-claimondo-bg text-claimondo-ondo'
                      }
                    >
                      {new Date(k.naechsteFrist).toLocaleDateString('de-DE')}
                    </StatusBadge>
                  ) : (
                    <span className="text-body-xs text-claimondo-ondo/50">—</span>
                  )}
                </Td>
                <Td>
                  <Link
                    href={`/faelle/${k.claimId}`}
                    className="text-body-xs font-mono text-claimondo-navy hover:text-claimondo-shield transition-colors"
                  >
                    {k.claimId.slice(0, 8)}
                  </Link>
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
    </SectionCard>
  )
}
