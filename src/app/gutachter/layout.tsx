import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GutachterShell from './GutachterShell'

export default async function GutachterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .single()

  if (profile?.rolle !== 'sachverstaendiger') redirect('/login')

  const displayName = [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''

  return (
    <GutachterShell displayName={displayName}>
      {children}
    </GutachterShell>
  )
}
