'use client'

import { useState } from 'react'
import { Building2Icon, GraduationCapIcon, CreditCardIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

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

const STATUS_BADGE: Record<string, { label: string; cls: string; Icon: typeof CheckCircleIcon }> = {
  aktiv: { label: 'Aktiv', cls: 'bg-success-soft text-success-strong', Icon: CheckCircleIcon },
  pending: { label: 'Pending', cls: 'bg-warning-soft text-warning-strong', Icon: ClockIcon },
  vertrag_unterzeichnet: { label: 'Vertrag', cls: 'bg-claimondo-bg text-claimondo-ondo', Icon: ClockIcon },
  anzahlung_offen: { label: 'Anzahlung offen', cls: 'bg-warning-soft text-warning-strong', Icon: AlertCircleIcon },
  blockiert: { label: 'Blockiert', cls: 'bg-danger-soft text-danger-strong', Icon: AlertCircleIcon },
}

export default function OrganisationenClient({ organisationen }: { organisationen: OrgRow[] }) {
  const [filter, setFilter] = useState<'alle' | 'buero' | 'akademie'>('alle')

  const filtered = filter === 'alle' ? organisationen : organisationen.filter(o => o.typ === filter)

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-bold text-claimondo-navy">Organisationen</h1>
          <p className="mt-0.5 text-body-sm text-claimondo-ondo">Alle Büros und Akademien. Communities haben einen eigenen Bereich.</p>
        </div>
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
      </div>

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
                const badge = STATUS_BADGE[o.onboarding_status] ?? STATUS_BADGE.pending
                const TypeIcon = o.typ === 'akademie' ? GraduationCapIcon : Building2Icon
                return (
                  <Tr key={o.id} className="hover:bg-claimondo-bg/50">
                    <Td>
                      <div className="flex items-center gap-2">
                        <TypeIcon className="w-4 h-4 text-claimondo-ondo flex-shrink-0" />
                        <span className="font-medium text-claimondo-navy">{o.name}</span>
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
                      <StatusBadge colorCls={badge.cls}>
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
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
