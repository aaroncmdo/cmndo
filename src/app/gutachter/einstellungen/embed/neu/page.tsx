// AAR-939 · Stream 6 — Neue Embed-Site (Wizard create).

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import PageHeader from '@/components/shared/PageHeader'
import { emptyEmbedSiteForm } from '@/lib/embed/site-write'
import EmbedSiteWizard from '../EmbedSiteWizard'

export const dynamic = 'force-dynamic'

export default async function NeueEmbedSitePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const sv = user
    ? await getGutachterForUser<{ brand_primary: string | null; brand_accent: string | null }>(
        supabase,
        user.id,
        'brand_primary, brand_accent',
      )
    : null

  return (
    <div className="py-6 space-y-4">
      <PageHeader title="Neue Embed-Site" size="lg" description="In 3 Schritten zu deinem Widget-Snippet." />
      <EmbedSiteWizard
        mode="create"
        initial={emptyEmbedSiteForm()}
        svBrand={sv ? { brand_primary: sv.brand_primary, brand_accent: sv.brand_accent } : null}
        defaultLogo="/brand/logo-mark.svg"
      />
    </div>
  )
}
