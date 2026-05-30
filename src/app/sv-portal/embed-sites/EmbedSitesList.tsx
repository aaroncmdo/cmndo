'use client'

// AAR-939 · Monika-Embed · Stream 6 — Embed-Sites-Liste (Client).
// Tabelle (shared/DataTable) + Aktiv-Toggle + "Neue Site". Klick auf Zeile →
// Edit. Aktiv-Toggle stoppt Propagation, damit der Zeilen-Klick nicht feuert.

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { PlusIcon, Code2Icon } from 'lucide-react'
import { Button, Badge } from '@/components/primitives'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  ClickableTr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'
import { toggleEmbedSiteAktiv } from './actions'

export interface EmbedSiteListRow {
  id: string
  name: string
  slug: string
  variante: string | null
  aktiv: boolean
  anfragen_gesamt: number | null
  erstellt_am: string
}

export default function EmbedSitesList({ sites }: { sites: EmbedSiteListRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onToggle(site: EmbedSiteListRow) {
    startTransition(async () => {
      const res = await toggleEmbedSiteAktiv(site.id, !site.aktiv)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success(site.aktiv ? 'Site pausiert' : 'Site aktiviert')
      router.refresh()
    })
  }

  if (sites.length === 0) {
    return (
      <EmptyState
        icon={Code2Icon}
        title="Noch keine Embed-Sites"
        description="Lege deine erste Widget-Site an und kopiere das Einbinde-Snippet."
        action={{ label: 'Neue Site anlegen', href: '/sv-portal/embed-sites/neu' }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="navy"
          iconLeft={<PlusIcon style={{ width: 16, height: 16 }} />}
          onClick={() => router.push('/sv-portal/embed-sites/neu')}
        >
          Neue Site
        </Button>
      </div>

      <DataTableContainer variant="card">
        <Table>
          <Thead>
            <Tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Variante</Th>
              <Th>Status</Th>
              <Th>Anfragen</Th>
              <Th>{''}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sites.map((site) => (
              <ClickableTr key={site.id} onClick={() => router.push(`/sv-portal/embed-sites/${site.id}`)}>
                <Td>{site.name}</Td>
                <Td>
                  <code className="text-xs text-claimondo-ondo">{site.slug}</code>
                </Td>
                <Td>
                  <Badge tone={site.variante === 'B' ? 'ondo' : 'neutral'}>
                    {site.variante === 'B' ? 'B · Paid' : 'A · Free'}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={site.aktiv ? 'success' : 'warning'}>
                    {site.aktiv ? 'Aktiv' : 'Pausiert'}
                  </Badge>
                </Td>
                <Td>{site.anfragen_gesamt ?? 0}</Td>
                <Td onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" loading={pending} onClick={() => onToggle(site)}>
                    {site.aktiv ? 'Pausieren' : 'Aktivieren'}
                  </Button>
                </Td>
              </ClickableTr>
            ))}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
