// profiles OAuth-Token-Auslagerung (Leak-Fix: jeder Staff konnte via is_staff() alle google/ms
// Refresh-Tokens aus profiles lesen). Die Tokens leben jetzt in profiles_oauth_secrets — einer
// service-role-only Tabelle (RLS deny-all fuer anon/authenticated). ALLE Consumer hier nutzen
// createAdminClient()/createServiceClient() (service_role bypasst RLS). Presence-Checks fuer
// authenticated-Clients laufen NICHT hierueber, sondern ueber das benigne profiles.*_connected_at
// (bleibt auf profiles). Kontext: coordination-profiles-oauth-secrets-auslagerung.
import type { SupabaseClient } from '@supabase/supabase-js'

export type OAuthProvider = 'google' | 'ms'

export type OAuthTokens = {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: string | null
}

/** Liest die Tokens eines Providers aus profiles_oauth_secrets (service_role). null wenn keine Row. */
export async function readOAuthTokens(
  db: SupabaseClient,
  userId: string,
  provider: OAuthProvider,
): Promise<OAuthTokens | null> {
  const { data } = await db
    .from('profiles_oauth_secrets')
    .select(`${provider}_access_token, ${provider}_refresh_token, ${provider}_token_expires_at`)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  const d = data as Record<string, string | null>
  return {
    accessToken: d[`${provider}_access_token`] ?? null,
    refreshToken: d[`${provider}_refresh_token`] ?? null,
    expiresAt: d[`${provider}_token_expires_at`] ?? null,
  }
}

/**
 * Upsert der Tokens eines Providers (service_role). Nur die uebergebenen Felder werden geschrieben
 * — laesst man refreshToken weg (Re-Connect ohne prompt=consent), bleibt der bestehende erhalten
 * (upsert ON CONFLICT DO UPDATE setzt nur die Payload-Spalten). Der andere Provider bleibt unberuehrt.
 */
export async function upsertOAuthTokens(
  db: SupabaseClient,
  userId: string,
  provider: OAuthProvider,
  vals: { accessToken?: string | null; refreshToken?: string | null; expiresAt?: string | null },
): Promise<{ error: { message: string } | null }> {
  const payload: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
  if ('accessToken' in vals) payload[`${provider}_access_token`] = vals.accessToken ?? null
  if ('refreshToken' in vals) payload[`${provider}_refresh_token`] = vals.refreshToken ?? null
  if ('expiresAt' in vals) payload[`${provider}_token_expires_at`] = vals.expiresAt ?? null
  const { error } = await db.from('profiles_oauth_secrets').upsert(payload, { onConflict: 'user_id' })
  return { error: error ? { message: error.message } : null }
}

/** Nullt die Tokens eines Providers (Disconnect, service_role). Der andere Provider bleibt. */
export async function clearOAuthTokens(
  db: SupabaseClient,
  userId: string,
  provider: OAuthProvider,
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  payload[`${provider}_access_token`] = null
  payload[`${provider}_refresh_token`] = null
  payload[`${provider}_token_expires_at`] = null
  await db.from('profiles_oauth_secrets').update(payload).eq('user_id', userId)
}
