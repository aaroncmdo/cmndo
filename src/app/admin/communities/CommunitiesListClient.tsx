'use client'

import { useState } from 'react'
import { UsersIcon, PlusIcon, ShieldCheckIcon } from 'lucide-react'
import CommunityAnlegenWizard from './CommunityAnlegenWizard'
import PageHeader from '@/components/shared/PageHeader'

type Community = {
  id: string
  name: string
  exklusiv: boolean
  radius_km: number | null
  max_faelle_monat: number | null
  member_count: number
  created_at: string
}

export default function CommunitiesListClient({ communities }: { communities: Community[] }) {
  const [showWizard, setShowWizard] = useState(false)

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Communities"
        description="Einkaufsgemeinschaften mit gemeinsamem Einsatzgebiet, eigenem Pool und Leaderboard."
        icon={UsersIcon}
        actions={
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold"
          >
            <PlusIcon className="w-4 h-4" /> Neue Community
          </button>
        }
      />

      {showWizard ? (
        <div className="glass-light border border-claimondo-border rounded-ios-md p-6">
          <CommunityAnlegenWizard onSuccess={() => setShowWizard(false)} onCancel={() => setShowWizard(false)} />
        </div>
      ) : null}

      <div className="glass-light border border-claimondo-border rounded-ios-md overflow-hidden">
        {communities.length === 0 ? (
          <div className="p-12 text-center">
            <UsersIcon className="w-8 h-8 text-claimondo-ondo/50 mx-auto mb-3" />
            <p className="text-sm text-claimondo-ondo">Noch keine Communities angelegt.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8f9fb] text-[10px] uppercase tracking-wide text-claimondo-ondo">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Mitglieder</th>
                <th className="text-left px-4 py-3">Radius</th>
                <th className="text-left px-4 py-3">Max Fälle/Monat</th>
                <th className="text-left px-4 py-3">Exklusiv</th>
                <th className="text-left px-4 py-3">Erstellt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-claimondo-border">
              {communities.map(c => (
                <tr key={c.id} className="hover:bg-[#f8f9fb]/50">
                  <td className="px-4 py-3 font-medium text-claimondo-navy">{c.name}</td>
                  <td className="px-4 py-3 text-claimondo-navy">{c.member_count}</td>
                  <td className="px-4 py-3 text-claimondo-navy">{c.radius_km ? `${c.radius_km} km` : '—'}</td>
                  <td className="px-4 py-3 text-claimondo-navy">{c.max_faelle_monat ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.exklusiv ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        <ShieldCheckIcon className="w-3 h-3" /> Exklusiv
                      </span>
                    ) : (
                      <span className="text-xs text-claimondo-ondo/70">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-claimondo-ondo">
                    {new Date(c.created_at).toLocaleDateString('de-DE')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
