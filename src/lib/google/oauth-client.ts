// AAR-96: Helper fuer Calendar-Calls im Namen eines Mitarbeiters.
// Nimmt User-ID, holt refresh_token aus profiles, gibt OAuth2Client zurueck.

import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getGoogleOAuthClientForUser(userId: string): Promise<OAuth2Client | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const db = createAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('google_refresh_token, google_access_token, google_token_expires_at')
    .eq('id', userId)
    .single()

  if (!profile?.google_refresh_token) return null

  const client = new google.auth.OAuth2(clientId, clientSecret)
  client.setCredentials({
    refresh_token: profile.google_refresh_token,
    access_token: profile.google_access_token ?? undefined,
    expiry_date: profile.google_token_expires_at ? new Date(profile.google_token_expires_at).getTime() : undefined,
  })

  // Auto-Refresh bei abgelaufenem access_token
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await db.from('profiles').update({
        google_access_token: tokens.access_token,
        google_token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      }).eq('id', userId)
    }
  })

  return client
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  const db = createAdminClient()
  const { data } = await db
    .from('profiles')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()
  return !!data?.google_refresh_token
}
