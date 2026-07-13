import { createAdminClient } from '@/lib/supabase/admin'
import ContentStudioClient from './ContentStudioClient'

// Admin-gated via src/app/admin/layout.tsx (requirePortalAccess(['admin'])).
export const dynamic = 'force-dynamic'

export default async function ContentStudioPage() {
  const db = createAdminClient()
  const { data: jobs } = await db
    .from('marketing_content_jobs')
    .select('id, thema, format, status, dauer_sekunden, kosten_cents, erstellt_am')
    .order('erstellt_am', { ascending: false })
    .limit(100)

  return <ContentStudioClient jobs={jobs ?? []} />
}
