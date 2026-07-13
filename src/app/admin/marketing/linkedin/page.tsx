import { createAdminClient } from '@/lib/supabase/admin'
import PageHeader from '@/components/shared/PageHeader'
import { LinkedInQueueClient } from './LinkedInQueueClient'
import type { LinkedInPostRow } from '@/lib/linkedin/types'

export const dynamic = 'force-dynamic'

export default async function LinkedInQueuePage() {
  const admin = createAdminClient()
  const { data: posts } = await admin
    .from('linkedin_posts')
    .select('*')
    .order('erstellt_am', { ascending: false })
    .limit(100)
  const { data: token } = await admin
    .from('linkedin_oauth_tokens')
    .select('organization_urn, expires_at')
    .maybeSingle()

  return (
    <div className="space-y-6 py-6">
      <PageHeader title="LinkedIn" description="Auto-Posting Freigabe-Queue" size="lg" />
      <LinkedInQueueClient
        posts={(posts ?? []) as LinkedInPostRow[]}
        connection={
          token
            ? {
                orgUrn: token.organization_urn as string,
                expiresAt: token.expires_at as string,
              }
            : null
        }
      />
    </div>
  )
}
