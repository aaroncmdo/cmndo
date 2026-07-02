import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { ModActions } from './ModActions'

export const dynamic = 'force-dynamic'

type PostRow = {
  id: string
  author_id: string
  author_display: string
  body: string
  status: string
  report_count: number
  created_at: string
}

type CommentRow = {
  id: string
  author_id: string
  author_display: string
  body: string
  target_kind: string
  target_id: string
  status: string
  report_count: number
  created_at: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'versteckt')
    return <span className="rounded-ios-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-strong">versteckt</span>
  if (status === 'geloescht')
    return <span className="rounded-ios-md bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger-strong">gelöscht</span>
  return <span className="rounded-ios-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success-strong">sichtbar</span>
}

export default async function CommunityModerationPage() {
  const guard = await requireRole(['admin'])
  if (!guard.success) redirect('/admin')

  const db = createAdminClient()

  const [{ data: postsData }, { data: commentsData }] = await Promise.all([
    db
      .from('community_posts')
      .select('id, author_id, author_display, body, status, report_count, created_at')
      .or('report_count.gt.0,status.eq.versteckt')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('community_comments')
      .select('id, author_id, author_display, body, target_kind, target_id, status, report_count, created_at')
      .or('report_count.gt.0,status.eq.versteckt')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const posts = (postsData ?? []) as PostRow[]
  const comments = (commentsData ?? []) as CommentRow[]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-claimondo-navy">Community-Moderation</h1>
      <p className="mt-1 text-sm text-claimondo-shield">
        {posts.length} gemeldete/versteckte Beiträge · {comments.length} gemeldete/versteckte Kommentare
      </p>

      {/* Beiträge */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-claimondo-navy">Beiträge</h2>
        {posts.length === 0 ? (
          <p className="mt-2 text-sm text-claimondo-shield">Keine gemeldeten oder versteckten Beiträge.</p>
        ) : (
          <DataTableContainer className="mt-2">
            <Table>
              <Thead>
                <Tr>
                  <Th>Autor</Th>
                  <Th>Inhalt</Th>
                  <Th>Meldungen</Th>
                  <Th>Status</Th>
                  <Th>Erstellt</Th>
                  <Th>Aktionen</Th>
                </Tr>
              </Thead>
              <Tbody>
                {posts.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">{p.author_display}</Td>
                    <Td className="max-w-md whitespace-pre-wrap">{p.body}</Td>
                    <Td className="text-center font-semibold text-danger-strong">{p.report_count}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                    <Td className="whitespace-nowrap text-xs text-claimondo-shield">{formatDate(p.created_at)}</Td>
                    <Td>
                      <ModActions id={p.id} authorId={p.author_id} kind="post" />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </DataTableContainer>
        )}
      </section>

      {/* Kommentare */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-claimondo-navy">Kommentare</h2>
        {comments.length === 0 ? (
          <p className="mt-2 text-sm text-claimondo-shield">Keine gemeldeten oder versteckten Kommentare.</p>
        ) : (
          <DataTableContainer className="mt-2">
            <Table>
              <Thead>
                <Tr>
                  <Th>Autor</Th>
                  <Th>Inhalt</Th>
                  <Th>Ziel</Th>
                  <Th>Meldungen</Th>
                  <Th>Status</Th>
                  <Th>Erstellt</Th>
                  <Th>Aktionen</Th>
                </Tr>
              </Thead>
              <Tbody>
                {comments.map((c) => (
                  <Tr key={c.id}>
                    <Td className="font-medium">{c.author_display}</Td>
                    <Td className="max-w-md whitespace-pre-wrap">{c.body}</Td>
                    <Td className="text-xs text-claimondo-shield">{c.target_kind}</Td>
                    <Td className="text-center font-semibold text-danger-strong">{c.report_count}</Td>
                    <Td><StatusBadge status={c.status} /></Td>
                    <Td className="whitespace-nowrap text-xs text-claimondo-shield">{formatDate(c.created_at)}</Td>
                    <Td>
                      <ModActions id={c.id} authorId={c.author_id} kind="comment" />
                    </Td>
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
