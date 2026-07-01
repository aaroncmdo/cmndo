// Wissen-Artikel Review-Portal — Admin-seitige Themen- und Draft-Verwaltung.
// Pattern: force-dynamic + createAdminClient() + DataTable — wie admin/kommentare/page.tsx.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import ThemaForm from './ThemaForm'
import DraftEditor from './DraftEditor'
import ThemaActions from './ThemaActions'
import GenerateDraftButton from './GenerateDraftButton'

export const dynamic = 'force-dynamic'

export default async function WissenArtikelPage() {
  // Auth-Guard (Admin only)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const admin = createAdminClient()

  // Themen laden — vorgeschlagen + freigegeben, neueste zuerst
  const { data: themenRaw } = await admin
    .from('wissen_themen')
    .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ, status, quelle, created_at')
    .in('status', ['vorgeschlagen', 'freigegeben'])
    .order('created_at', { ascending: false })
    .limit(50)

  // Drafts in Review laden, neueste zuerst
  const { data: draftsRaw } = await admin
    .from('wissen_artikel')
    .select('id, title, slug, excerpt, body, meta_description, primary_keyword, cluster, status, created_at')
    .eq('status', 'in_review')
    .order('created_at', { ascending: false })
    .limit(20)

  const themen = (themenRaw ?? []) as Array<{
    id: string
    titel: string
    kurzbrief: string | null
    primary_keyword: string | null
    cluster: string | null
    artikel_typ: string | null
    status: string
    quelle: string
    created_at: string
  }>

  const drafts = (draftsRaw ?? []) as Array<{
    id: string
    title: string
    slug: string
    excerpt: string | null
    body: string
    meta_description: string | null
    primary_keyword: string | null
    cluster: string | null
    status: string
    created_at: string
  }>

  const vorgeschlagen = themen.filter(t => t.status === 'vorgeschlagen')
  const freigegeben = themen.filter(t => t.status === 'freigegeben')

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Wissen-Artikel"
        description="Themen verwalten, AI-Drafts generieren und Artikel freigeben"
      />

      {/* Sektion: Themen */}
      <SectionCard title="Themen" subtitle="Themen anlegen, freigeben oder ablehnen. Freigegebene Themen können als AI-Draft generiert werden.">
        {/* Manuelles Thema anlegen */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-3">Neues Thema anlegen</h3>
          <ThemaForm />
        </div>

        {/* Vorgeschlagene Themen */}
        {vorgeschlagen.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-3">
              Vorgeschlagen ({vorgeschlagen.length})
            </h3>
            <DataTableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Titel</Th>
                    <Th>Keyword</Th>
                    <Th>Cluster</Th>
                    <Th>Eingereicht</Th>
                    <Th>Aktionen</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {vorgeschlagen.map(t => (
                    <Tr key={t.id}>
                      <Td>
                        <p className="font-medium">{t.titel}</p>
                        {t.kurzbrief && <p className="text-xs text-claimondo-ondo mt-0.5">{t.kurzbrief}</p>}
                      </Td>
                      <Td>{t.primary_keyword ?? '—'}</Td>
                      <Td>{t.cluster ?? '—'}</Td>
                      <Td className="text-xs">{new Date(t.created_at).toLocaleDateString('de-DE')}</Td>
                      <Td>
                        <ThemaActions themaId={t.id} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          </div>
        )}

        {/* Freigegebene Themen */}
        {freigegeben.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider mb-3">
              Freigegeben ({freigegeben.length})
            </h3>
            <DataTableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Titel</Th>
                    <Th>Keyword</Th>
                    <Th>Cluster</Th>
                    <Th>Quelle</Th>
                    <Th>Draft generieren</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {freigegeben.map(t => (
                    <Tr key={t.id}>
                      <Td>
                        <p className="font-medium">{t.titel}</p>
                        {t.kurzbrief && <p className="text-xs text-claimondo-ondo mt-0.5">{t.kurzbrief}</p>}
                      </Td>
                      <Td>{t.primary_keyword ?? '—'}</Td>
                      <Td>{t.cluster ?? '—'}</Td>
                      <Td className="text-xs">{t.quelle === 'manuell' ? 'Manuell' : 'AI-Gap'}</Td>
                      <Td>
                        <GenerateDraftButton themaId={t.id} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          </div>
        )}

        {themen.length === 0 && (
          <p className="text-sm text-claimondo-ondo/70 py-4 text-center">
            Keine offenen Themen. Lege oben ein neues Thema an.
          </p>
        )}
      </SectionCard>

      {/* Sektion: Drafts in Review */}
      <SectionCard title="Drafts in Review" subtitle="KI-generierte Artikel prüfen, bearbeiten und veröffentlichen">
        {drafts.length === 0 ? (
          <p className="text-sm text-claimondo-ondo/70 py-4 text-center">
            Keine Drafts zur Review. Generiere einen Draft aus einem freigegebenen Thema.
          </p>
        ) : (
          <div className="space-y-6">
            {drafts.map(draft => (
              <DraftEditor key={draft.id} draft={draft} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
