import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'

// AAR-361: Smart-Root. Wenn der User bereits eingeloggt ist, direkt ins
// passende Portal statt auf /login umzuleiten — sonst landet der User nach
// erfolgreichem 2FA (TwoFaClient → router.push('/')) wieder auf dem Login-
// Screen.
export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  redirect(roleToPath(profile?.rolle as string | null | undefined))
}
