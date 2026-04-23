'use client'

import { useState } from 'react'
import { Building2Icon, GraduationCapIcon, CreditCardIcon, CheckCircleIcon, ClockIcon, AlertCircleIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'

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
  aktiv: { label: 'Aktiv', cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircleIcon },
  pending: { label: 'Pending', cls: 'bg-yellow-50 text-yellow-700', Icon: ClockIcon },
  vertrag_unterzeichnet: { label: 'Vertrag', cls: 'bg-blue-50 text-blue-700', Icon: ClockIcon },
  anzahlung_offen: { label: 'Anzahlung offen', cls: 'bg-amber-50 text-amber-700', Icon: AlertCircleIcon },
  blockiert: { label: 'Blockiert', cls: 'bg-red-50 text-red-700', Icon: AlertCircleIcon },
}

export default function OrganisationenClient({ organisationen }: { organisationen: OrgRow[] }) {
  const [filter, setFilter] = useState<'alle' | 'buero' | 'akademie'>('alle')

  const filtered = filter === 'alle' ? organisationen : organisationen.filter(o => o.typ === filter)

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Organisationen"
        description="Alle Büros und Akademien. Communities haben einen eigenen Bereich."
        icon={Building2Icon}
        actions={
          <div className="inline-flex bg-gray-100 rounded-xl p-0.5 text-xs font-medium">
            {(['alle', 'buero', 'akademie'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg transition-colors capitalize ${
                  filter === f ? 'bg-white text-[#1E3A5F] shadow' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {f === 'alle' ? `Alle (${organisationen.length})` : f === 'buero' ? `Büros (${organisationen.filter(o => o.typ === 'buero').length})` : `Akademien (${organisationen.filter(o => o.typ === 'akademie').length})`}
              </button>
            ))}
          </div>
        }
      />

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Building2Icon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Keine Organisationen gefunden.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Organisation</th>
                <th className="text-left px-4 py-3">Typ</th>
                <th className="text-left px-4 py-3">Verwalter</th>
                <th className="text-right px-4 py-3">Mitglieder</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Stripe</th>
                <th className="text-left px-4 py-3">Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(o => {
                const badge = STATUS_BADGE[o.onboarding_status] ?? STATUS_BADGE.pending
                const TypeIcon = o.typ === 'akademie' ? GraduationCapIcon : Building2Icon
                return (
                  <tr key={o.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon className="w-4 h-4 text-claimondo-ondo flex-shrink-0" />
                        <span className="font-medium text-gray-900">{o.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge colorCls={o.typ === 'akademie' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}>
                        {o.typ === 'akademie' ? 'Akademie' : 'Büro'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {o.verwalter_name ? (
                        <div>
                          <div className="text-xs text-gray-900">{o.verwalter_name}</div>
                          {o.verwalter_email && <div className="text-[10px] text-gray-400">{o.verwalter_email}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{o.member_count}</td>
                    <td className="px-4 py-3">
                      <StatusBadge colorCls={badge.cls}>
                        <badge.Icon className="w-3 h-3" /> {badge.label}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {o.has_stripe ? (
                        <CreditCardIcon className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(o.created_at).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
