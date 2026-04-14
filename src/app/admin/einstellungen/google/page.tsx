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

  // Booleansigner check via separate admin-fetch fuer refresh_token (nie an Frontend exposed)
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminDb = createAdminClient()
  const { data: tokenCheck } = await adminDb
    .from('profiles')
    .select('google_refresh_token')
    .eq('id', user.id)
    .single()
  const isConnected = !!tokenCheck?.google_refresh_token

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
