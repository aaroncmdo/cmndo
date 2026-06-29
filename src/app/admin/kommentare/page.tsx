import { createAdminClient } from '@/lib/supabase/admin'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { ModerationActions } from './ModerationActions'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; body: string; article_slug: string; created_at: string; author_id: string; report_count?: number
  community_profiles: { username?: string } | { username?: string }[] | null
}

function username(r: Row): string {
  const p = Array.isArray(r.community_profiles) ? r.community_profiles[0] : r.community_profiles
  return p?.username ?? 'unbekannt'
}

export default async function KommentarModerationPage() {
  const db = createAdminClient()
  const [{ data: pendingData }, { data: reportedData }] = await Promise.all([
    db
      .from('article_comments')
      .select('id, body, article_slug, created_at, author_id, community_profiles(username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('article_comments')
      .select('id, body, article_slug, created_at, author_id, report_count, community_profiles(username)')
      .eq('status', 'approved')
      .gt('report_count', 0)
      .order('report_count', { ascending: false })
      .limit(50),
  ])
  const rows = (pendingData ?? []) as Row[]
  const reported = (reportedData ?? []) as Row[]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-claimondo-navy">Kommentar-Moderation</h1>
      <p className="mt-1 text-sm text-claimondo-shield">
        {rows.length} ausstehende{reported.length > 0 ? ` · ${reported.length} gemeldete` : ''} Kommentare.
      </p>

      {reported.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-danger-strong">Gemeldete Kommentare (bereits öffentlich)</h2>
          <DataTableContainer className="mt-2">
            <Table>
              <Thead>
                <Tr><Th>Nutzer</Th><Th>Artikel</Th><Th>Kommentar</Th><Th>Meldungen</Th><Th>Aktionen</Th></Tr>
              </Thead>
              <Tbody>
                {reported.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{username(r)}</Td>
                    <Td className="font-mono text-xs">{r.article_slug}</Td>
                    <Td className="max-w-md whitespace-pre-wrap">{r.body}</Td>
                    <Td className="text-center font-semibold text-danger-strong">{r.report_count ?? 0}</Td>
                    <Td><ModerationActions id={r.id} authorId={r.author_id} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-claimondo-navy">Ausstehende Kommentare</h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-claimondo-shield">Keine ausstehenden Kommentare.</p>
        ) : (
          <DataTableContainer className="mt-2">
            <Table>
              <Thead>
                <Tr><Th>Nutzer</Th><Th>Artikel</Th><Th>Kommentar</Th><Th>Aktionen</Th></Tr>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{username(r)}</Td>
                    <Td className="font-mono text-xs">{r.article_slug}</Td>
                    <Td className="max-w-md whitespace-pre-wrap">{r.body}</Td>
                    <Td><ModerationActions id={r.id} authorId={r.author_id} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
      </section>
    </div>
  )
}
