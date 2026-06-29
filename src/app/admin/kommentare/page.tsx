import { createAdminClient } from '@/lib/supabase/admin'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { ModerationActions } from './ModerationActions'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; body: string; article_slug: string; created_at: string; author_id: string
  community_profiles: { username?: string } | { username?: string }[] | null
}

export default async function KommentarModerationPage() {
  const db = createAdminClient()
  const { data } = await db
    .from('article_comments')
    .select('id, body, article_slug, created_at, author_id, community_profiles(username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)
  const rows = (data ?? []) as Row[]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-claimondo-navy">Kommentar-Moderation</h1>
      <p className="mt-1 text-sm text-claimondo-shield">{rows.length} ausstehende Kommentare.</p>
      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-claimondo-shield">Keine ausstehenden Kommentare.</p>
      ) : (
        <DataTableContainer className="mt-5">
          <Table>
            <Thead>
              <Tr><Th>Nutzer</Th><Th>Artikel</Th><Th>Kommentar</Th><Th>Aktionen</Th></Tr>
            </Thead>
            <Tbody>
              {rows.map((r) => {
                const p = Array.isArray(r.community_profiles) ? r.community_profiles[0] : r.community_profiles
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">{p?.username ?? 'unbekannt'}</Td>
                    <Td className="font-mono text-xs">{r.article_slug}</Td>
                    <Td className="max-w-md whitespace-pre-wrap">{r.body}</Td>
                    <Td><ModerationActions id={r.id} authorId={r.author_id} /></Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}
    </div>
  )
}
