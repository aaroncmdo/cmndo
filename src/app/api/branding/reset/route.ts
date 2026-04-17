// AAR-422: DELETE /api/branding/reset
//
// Setzt use_custom_branding auf false und löscht brand_theme. logo_url bleibt
// erhalten — der User kann sein Branding später wieder aktivieren ohne neu
// hochzuladen.

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id, organisation_id, ist_parent_account')
    .eq('profile_id', user.id)
    .maybeSingle()
  if (!sv) return NextResponse.json({ error: 'Kein SV-Profil' }, { status: 403 })

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope')
  const useOrg = scope === 'org' && sv.ist_parent_account && sv.organisation_id

  const db = createAdminClient()
  const patch = { use_custom_branding: false, brand_theme: null } as const

  if (useOrg) {
    await db.from('organisationen').update(patch).eq('id', sv.organisation_id!)
    await db.from('sachverstaendige').update(patch).eq('id', sv.id)
  } else {
    await db.from('sachverstaendige').update(patch).eq('id', sv.id)
  }

  revalidatePath('/gutachter')
  revalidatePath('/gutachter/profil/branding')
  return NextResponse.json({ success: true })
}
