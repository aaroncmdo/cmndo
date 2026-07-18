// AAR-96: Helper fuer Calendar-Calls im Namen eines Mitarbeiters.
// Nimmt User-ID, holt refresh_token aus profiles, gibt OAuth2Client zurueck.

import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOAuthTokens, upsertOAuthTokens } from '@/lib/oauth/secrets'

export async function getGoogleOAuthClientForUser(userId: string): Promise<OAuth2Client | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const db = createAdminClient()
  const secret = await readOAuthTokens(db, userId, 'google')
  if (!secret?.refreshToken) return null

  const client = new google.auth.OAuth2(clientId, clientSecret)
  client.setCredentials({
    refresh_token: secret.refreshToken,
    access_token: secret.accessToken ?? undefined,
    expiry_date: secret.expiresAt ? new Date(secret.expiresAt).getTime() : undefined,
  })

  // Auto-Refresh bei abgelaufenem access_token -> zurueck in die Secret-Tabelle.
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await upsertOAuthTokens(db, userId, 'google', {
        accessToken: tokens.access_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      })
    }
  })

  return client
}

export async function isGoogleConnected(userId: string): Promise<boolean> {
  const db = createAdminClient()
  const secret = await readOAuthTokens(db, userId, 'google')
  return !!secret?.refreshToken
}
