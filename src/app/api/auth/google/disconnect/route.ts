// AAR-96: Google OAuth Disconnect (loescht Tokens + revoked bei Google)
import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOAuthTokens, clearOAuthTokens } from '@/lib/oauth/secrets'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const adminDb = createAdminClient()

  // Vorhandenen Refresh-Token aus der Secret-Tabelle holen, um bei Google zu revoken
  const secret = await readOAuthTokens(adminDb, user.id, 'google')

  if (secret?.refreshToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      )
      await oauth2Client.revokeToken(secret.refreshToken)
    } catch (err) {
      console.error('[AAR-96] revokeToken failed (Token wird trotzdem geloescht):', err)
    }
  }

  // Tokens in der Secret-Tabelle nullen; benige Presence-/Anzeige-Felder auf profiles clearen.
  await clearOAuthTokens(adminDb, user.id, 'google')
  await adminDb.from('profiles').update({
    google_email: null,
    google_connected_at: null,
  }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
