'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UsersIcon, PlusIcon, ShieldCheckIcon } from 'lucide-react'
import CommunityAnlegenWizard from './CommunityAnlegenWizard'
// Tr = Kopfzeile, ClickableTr = drillbare Body-Zeilen.
import { Table, Thead, Tbody, Tr, ClickableTr, Th, Td } from '@/components/shared/DataTable'
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
  const router = useRouter()
  const [showWizard, setShowWizard] = useState(false)

  return (
    <div className="px-8 py-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Communities"
        description="Einkaufsgemeinschaften mit gemeinsamem Einsatzgebiet, eigenem Pool und Leaderboard."
        size="lg"
        actions={
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-ios-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-body-sm font-semibold"
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
            <p className="text-body-sm text-claimondo-ondo">Noch keine Communities angelegt.</p>
          </div>
        ) : (
          <Table>
            <Thead className="text-caption! tracking-wide!">
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
                // P1: Eine Community IST eine organisation (typ='community') — sie hat
                // keine eigene Tabelle und braucht daher auch keine eigene Detail-View.
                // Wir drillen auf die bestehende Org-Detail-Route.
                <ClickableTr
                  key={c.id}
                  onClick={() => router.push(`/admin/organisationen/${c.id}`)}
                >
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.member_count}</Td>
                  <Td>{c.radius_km ? `${c.radius_km} km` : '—'}</Td>
                  <Td>{c.max_faelle_monat ?? '—'}</Td>
                  <Td>
                    {c.exklusiv ? (
                      <span className="inline-flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-warning-soft text-warning-strong font-medium">
                        <ShieldCheckIcon className="w-3 h-3" /> Exklusiv
                      </span>
                    ) : (
                      <span className="text-body-xs text-claimondo-ondo/70">—</span>
                    )}
                  </Td>
                  <Td className="text-body-xs text-claimondo-ondo!">
                    {new Date(c.created_at).toLocaleDateString('de-DE')}
                  </Td>
                </ClickableTr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  )
}
