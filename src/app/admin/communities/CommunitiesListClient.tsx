'use client'

import { useState } from 'react'
import { UsersIcon, PlusIcon, ShieldCheckIcon } from 'lucide-react'
import CommunityAnlegenWizard from './CommunityAnlegenWizard'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

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
            className="flex items-center gap-2 px-4 py-2.5 rounded-ios-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold"
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
          <Table>
            <Thead className="text-[10px]! tracking-wide!">
              <Tr>
                <Th className="text-left">Name</Th>
                <Th className="text-left">Mitglieder</Th>
                <Th className="text-left">Radius</Th>
                <Th className="text-left">Max Fälle/Monat</Th>
                <Th className="text-left">Exklusiv</Th>
                <Th className="text-left">Erstellt</Th>
              </Tr>
            </Thead>
            <Tbody>
              {communities.map(c => (
                <Tr key={c.id} className="hover:bg-claimondo-bg/50">
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.member_count}</Td>
                  <Td>{c.radius_km ? `${c.radius_km} km` : '—'}</Td>
                  <Td>{c.max_faelle_monat ?? '—'}</Td>
                  <Td>
                    {c.exklusiv ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        <ShieldCheckIcon className="w-3 h-3" /> Exklusiv
                      </span>
                    ) : (
                      <span className="text-xs text-claimondo-ondo/70">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-claimondo-ondo!">
                    {new Date(c.created_at).toLocaleDateString('de-DE')}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
