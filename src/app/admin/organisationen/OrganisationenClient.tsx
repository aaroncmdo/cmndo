'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2Icon, GraduationCapIcon, CreditCardIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
// Tr = Kopfzeile, ClickableTr = drillbare Body-Zeilen.
import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
// P1: Label+Farbe des onboarding_status kommen aus EINER Quelle — die Detail-View
// nutzt dieselbe, sonst laufen Liste und Detail auseinander.
import { orgOnboardingBadge } from '@/lib/organisationen/onboarding-status'

type OrgRow = {
  id: string
  name: string
  typ: string
  onboarding_status: string
  has_stripe: boolean
  member_count: number
  verwalter_name: string | null
  verwalter_email: string | null
  created_at: string
}

export default function OrganisationenClient({ organisationen }: { organisationen: OrgRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'alle' | 'buero' | 'akademie'>('alle')

  const filtered = filter === 'alle' ? organisationen : organisationen.filter(o => o.typ === filter)

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Organisationen"
        description="Alle Büros und Akademien. Communities haben einen eigenen Bereich."
        size="lg"
        actions={
          <div className="inline-flex bg-claimondo-bg rounded-ios-xl p-0.5 text-body-xs font-medium">
            {(['alle', 'buero', 'akademie'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-ios-lg transition-colors capitalize ${
                  filter === f ? 'bg-white text-claimondo-shield shadow' : 'text-claimondo-ondo hover:text-claimondo-navy'
                }`}>
                {f === 'alle' ? `Alle (${organisationen.length})` : f === 'buero' ? `Büros (${organisationen.filter(o => o.typ === 'buero').length})` : `Akademien (${organisationen.filter(o => o.typ === 'akademie').length})`}
              </button>
            ))}
          </div>
        }
      />

      <div className="bg-white border border-claimondo-border rounded-ios-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Building2Icon className="w-8 h-8 text-claimondo-ondo/50 mx-auto mb-3" />
            <p className="text-body-sm text-claimondo-ondo">Keine Organisationen gefunden.</p>
          </div>
        ) : (
          <Table>
            <Thead className="text-caption! tracking-wide!">
              <Tr>
                <Th className="text-left">Organisation</Th>
                <Th className="text-left">Typ</Th>
                <Th className="text-left">Verwalter</Th>
                <Th className="text-right">Mitglieder</Th>
                <Th className="text-left">Status</Th>
                <Th className="text-left">Stripe</Th>
                <Th className="text-left">Erstellt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map(o => {
                const badge = orgOnboardingBadge(o.onboarding_status)
                const TypeIcon = o.typ === 'akademie' ? GraduationCapIcon : Building2Icon
                return (
                  // P1: Zeile drillbar — Soft-Nav oeffnet den Drawer (Intercepting-Route),
                  // ein Deep-Link auf dieselbe URL rendert die Full-Page.
                  <ClickableTr
                    key={o.id}
                    onClick={() => router.push(`/admin/organisationen/${o.id}`)}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="w-4 h-4 text-claimondo-ondo flex-shrink-0" />
                        {/* Echter Link statt nur ClickableTr-onClick: Mittelklick/Strg+Klick
                            oeffnet die Full-Page im neuen Tab — genau das, was der Kommentar
                            oben als "Deep-Link" beschreibt. Der normale Klick navigiert
                            weiterhin client-seitig und trifft dieselbe Intercepting-Route
                            (Drawer). Muster: FaelleKanban.tsx:235. */}
                        <Link
                          href={`/admin/organisationen/${o.id}`}
                          onClick={e => e.stopPropagation()}
                          className="font-medium text-claimondo-navy"
                        >
                          {o.name}
                        </Link>
                      </div>
                    </Td>
                    <Td>
                      <StatusBadge colorCls={o.typ === 'akademie' ? 'bg-claimondo-ondo/[0.06] text-claimondo-navy' : 'bg-claimondo-bg text-claimondo-ondo'}>
                        {o.typ === 'akademie' ? 'Akademie' : 'Büro'}
                      </StatusBadge>
                    </Td>
                    <Td>
                      {o.verwalter_name ? (
                        <div>
                          <div className="text-body-xs text-claimondo-navy">{o.verwalter_name}</div>
                          {o.verwalter_email && <div className="text-caption text-claimondo-ondo/70">{o.verwalter_email}</div>}
                        </div>
                      ) : (
                        <span className="text-body-xs text-claimondo-ondo/70">—</span>
                      )}
                    </Td>
                    <Td className="text-right font-medium">{o.member_count}</Td>
                    <Td>
                      <StatusBadge colorCls={badge.colorCls}>
                        <badge.Icon className="w-3 h-3" /> {badge.label}
                      </StatusBadge>
                    </Td>
                    <Td>
                      {o.has_stripe ? (
                        <CreditCardIcon className="w-4 h-4 text-success" />
                      ) : (
                        <span className="text-body-xs text-claimondo-ondo/50">—</span>
                      )}
                    </Td>
                    <Td className="text-body-xs text-claimondo-ondo!">
                      {new Date(o.created_at).toLocaleDateString('de-DE')}
                    </Td>
                  </ClickableTr>
                )
              })}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
