// AAR-939 · Stream 6 — Neue Embed-Site (Wizard create).

import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { emptyEmbedSiteForm } from '@/lib/embed/site-write'
import EmbedSiteWizard from '../EmbedSiteWizard'

export const dynamic = 'force-dynamic'

export default async function NeueEmbedSitePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const sv = user
    ? await getGutachterForUser<{ brand_primary: string | null; brand_accent: string | null; verifiziert: boolean | null }>(
        supabase,
        user.id,
        'brand_primary, brand_accent, verifiziert',
      )
    : null

  return (
    <div className="py-6 space-y-4">
      <EmbedSiteWizard
        mode="create"
        initial={emptyEmbedSiteForm()}
        svBrand={sv ? { brand_primary: sv.brand_primary, brand_accent: sv.brand_accent } : null}
        defaultLogo="/brand/logo-mark.svg"
        svVerifiziert={!!sv?.verifiziert}
      />
    </div>
  )
}
