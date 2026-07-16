import { createAdminClient } from '@/lib/supabase/admin'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
import { ModerationActions } from './ModerationActions'

export const dynamic = 'force-dynamic'

type Row = {
  id: string; body: string; article_slug: string; created_at: string; author_id: string; report_count?: number
}

export default async function KommentarModerationPage() {
  const db = createAdminClient()
  const [{ data: pendingData }, { data: reportedData }] = await Promise.all([
    db
      .from('article_comments')
      .select('id, body, article_slug, created_at, author_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('article_comments')
      .select('id, body, article_slug, created_at, author_id, report_count')
      .eq('status', 'approved')
      .gt('report_count', 0)
      .order('report_count', { ascending: false })
      .limit(50),
  ])
  const rows = (pendingData ?? []) as Row[]
  const reported = (reportedData ?? []) as Row[]

  // Usernames separat laden: article_comments hat KEINE FK auf community_profiles
  // (author_id -> users; ein Community-Profil ist optional) -> ein PostgREST-Embed
  // ist unaufloesbar (PGRST200, Query-Parse-Sweep). Zwei-Schritt statt FK-Zwang.
  const authorIds = [...new Set([...rows, ...reported].map((r) => r.author_id).filter(Boolean))]
  const { data: profileData } = authorIds.length
    ? await db.from('community_profiles').select('user_id, username').in('user_id', authorIds)
    : { data: [] as Array<{ user_id: string; username: string | null }> }
  const nameByAuthor = new Map(
    ((profileData ?? []) as Array<{ user_id: string; username: string | null }>).map((p) => [p.user_id, p.username]),
  )
  const usernameVon = (authorId: string) => nameByAuthor.get(authorId) ?? 'unbekannt'

  return (
    <div className="p-6">
      <PageHeader
        title="Kommentar-Moderation"
        description={<>{rows.length} ausstehende{reported.length > 0 ? ` · ${reported.length} gemeldete` : ''} Kommentare.</>}
        size="lg"
      />

      <details className="mt-4 rounded-ios-md border border-claimondo-border bg-white p-4 text-sm text-claimondo-shield">
        <summary className="cursor-pointer font-semibold text-claimondo-navy">Moderations-Leitfaden — wann ablehnen?</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li><strong>Gesundheits-/Verletzungsdaten</strong> (über sich oder Dritte) — Art. 9, immer ablehnen.</li>
          <li><strong>Daten Dritter</strong>: Klarnamen + Vorwürfe, Kennzeichen, Adressen, Telefonnummern.</li>
          <li><strong>Namentliche Anschuldigungen</strong> gegen Werkstatt/Gutachter/Versicherer/Mitarbeitende (üble Nachrede).</li>
          <li><strong>Konkreter Rechtsrat</strong> an Dritte (RDG).</li>
          <li><strong>Beleidigung/Hetze/Diskriminierung</strong>, strafbare Inhalte.</li>
          <li><strong>Spam/Werbung/Links</strong> von nicht freigeschalteten Konten.</li>
          <li><strong>Identitätstäuschung</strong> (Username gibt Claimondo/Anwalt/Behörde vor) → zusätzlich sperren.</li>
        </ul>
        <p className="mt-2">Gemeldete Kommentare zeitnah prüfen (Notice-and-Takedown). Im Zweifel ablehnen. Unklare Rechtsfälle an Aaron/Anwalt eskalieren. Voller Leitfaden: <span className="font-mono text-xs">docs/2026-06-30-artikel-kommentare-moderations-leitfaden.md</span></p>
      </details>

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
                    <Td className="font-medium">{usernameVon(r.author_id)}</Td>
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
                    <Td className="font-medium">{usernameVon(r.author_id)}</Td>
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
