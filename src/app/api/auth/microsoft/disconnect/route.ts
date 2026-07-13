// SP5a: Microsoft OAuth Disconnect — nullt profiles.ms_*. Mirror /api/auth/google/disconnect.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet' }, { status: 401 })

  const db = createAdminClient()
  const { error } = await db
    .from('profiles')
    .update({
      ms_refresh_token: null,
      ms_access_token: null,
      ms_token_expires_at: null,
      ms_email: null,
      ms_connected_at: null,
    })
    .eq('id', user.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
