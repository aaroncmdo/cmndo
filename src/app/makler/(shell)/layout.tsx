// AAR-483 (M1): Makler-Portal-Layout. Auth-Guard + Rollen-Check + Makler-Row-
// Bootstrap + Status-Weiche. Bei fehlender Makler-Row wird auf /makler/onboarding
// umgeleitet (Edge-Case), bei status != 'aktiv' auf /makler/pending.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { MaklerShell } from '@/components/makler/MaklerShell'

export const dynamic = 'force-dynamic'

export default async function MaklerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  // AAR-718: Bei falscher Rolle in eigenes Portal statt auf Landing-Page.
  if (profile?.rolle !== 'makler') redirect(roleToPath(profile?.rolle as string | null | undefined))

  const { data: makler } = await supabase
    .from('makler')
    .select('id, firma, ansprechpartner_vorname, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!makler) redirect('/makler/onboarding')
  if (makler.status !== 'aktiv') redirect('/makler/pending')

  return (
    <MaklerShell makler={makler} email={user.email ?? ''} userId={user.id}>
      {children}
    </MaklerShell>
  )
}
