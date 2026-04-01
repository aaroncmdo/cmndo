import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KundeShell from './KundeShell'

export default async function KundeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'kunde') redirect('/login')

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  return (
    <KundeShell displayName={displayName} email={user.email ?? ''}>
      {children}
    </KundeShell>
  )
}
