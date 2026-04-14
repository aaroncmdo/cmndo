// AAR-96: Google OAuth Disconnect (loescht Tokens + revoked bei Google)
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const adminDb = createAdminClient()

  // Vorhandenen Refresh-Token holen, um zu revoken
  const { data: profile } = await adminDb
    .from('profiles')
    .select('google_refresh_token')
    .eq('id', user.id)
    .single()

  if (profile?.google_refresh_token) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      )
      await oauth2Client.revokeToken(profile.google_refresh_token)
    } catch (err) {
      console.error('[AAR-96] revokeToken failed (Token wird trotzdem geloescht):', err)
    }
  }

  await adminDb.from('profiles').update({
    google_refresh_token: null,
    google_access_token: null,
    google_token_expires_at: null,
    google_email: null,
    google_connected_at: null,
  }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
