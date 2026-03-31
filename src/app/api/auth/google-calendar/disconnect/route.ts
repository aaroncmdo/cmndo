import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const svc = createServiceClient()
  await svc.from('sachverstaendige').update({
    gcal_access_token: null, gcal_refresh_token: null, gcal_token_expiry: null, gcal_connected: false,
  }).eq('profile_id', user.id)

  return NextResponse.json({ success: true })
}
