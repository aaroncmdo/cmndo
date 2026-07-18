// AAR-96: Google OAuth Settings Page
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import GoogleSettingsClient from './GoogleSettingsClient'

export const dynamic = 'force-dynamic'

export default async function GoogleSettingsPage({ searchParams }: {
  searchParams: Promise<{ success?: string; error?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('google_email, google_connected_at')
    .eq('id', user.id)
    .single()

  // Presence via benignes connected_at — der Refresh-Token lebt jetzt in profiles_oauth_secrets
  // (service-role-only Leak-Fix, nie an Frontend exposed); connected_at wird im Callback gesetzt +
  // Disconnect gecleart, ist also aequivalent zur Token-Praesenz.
  const isConnected = !!profile?.google_connected_at

  const params = await searchParams

  return (
    <GoogleSettingsClient
      isConnected={isConnected}
      googleEmail={profile?.google_email ?? null}
      connectedAt={profile?.google_connected_at ?? null}
      success={params.success === '1'}
      error={params.error ?? null}
    />
  )
}
