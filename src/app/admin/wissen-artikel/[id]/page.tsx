// Wissen-Artikel Draft-Detail (W2.1, Routen-Cleanup: docs/2026-07-17-routen-cleanup-
// detail-view-audit.md). Der Volleditor EINES in_review-Drafts als eigene Detail-View
// statt gestapelt in der Liste (die Liste rendete bisher pro Draft einen 180-Zeilen-Editor
// untereinander -> bei >3 Drafts unbenutzbar). EntityDetailShell (Single-View, keine Tabs)
// + der bestehende DraftEditor. Die Liste /admin/wissen-artikel verlinkt per Zeile hierher.
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import EntityDetailShell from '@/components/shared/detail/EntityDetailShell'
import DraftEditor, { type DraftRow } from '../DraftEditor'

export const dynamic = 'force-dynamic'

export default async function WissenDraftDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Auth-Guard (Admin only) — wie die Liste.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  const admin = createAdminClient()
  const { data: draft } = await admin
    .from('wissen_artikel')
    .select('id, title, slug, excerpt, body, meta_description, meta_title, primary_keyword, cluster, status, created_at')
    .eq('id', id)
    .eq('status', 'in_review')
    .maybeSingle()

  // Nur in_review-Drafts sind hier editierbar; alles andere (bereits veroeffentlicht,
  // abgelehnt, unbekannte id) -> zurueck zur Liste via notFound.
  if (!draft) notFound()

  return (
    <EntityDetailShell
      variant="page"
      title={draft.title as string}
      backHref="/admin/wissen-artikel"
      backLabel="Wissen-Artikel"
      description={
        <span className="flex flex-wrap items-center gap-2 text-caption text-claimondo-ondo/70">
          <span>Entwurf in Review</span>
          {draft.primary_keyword ? <span>· {draft.primary_keyword as string}</span> : null}
          {draft.cluster ? <span>· {draft.cluster as string}</span> : null}
          <span>· eingereicht {new Date(draft.created_at as string).toLocaleDateString('de-DE')}</span>
        </span>
      }
    >
      <div className="flex-1 overflow-y-auto p-4">
        <DraftEditor draft={draft as DraftRow} />
      </div>
    </EntityDetailShell>
  )
}
