'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash, randomBytes } from 'crypto'
import { cookies } from 'next/headers'

// KFZ-184: Remember-Me Token Management.
// Token wird als HttpOnly Cookie gesetzt (30 Tage) und als SHA-256 Hash in DB gespeichert.

const COOKIE_NAME = 'claimondo_remember'
const TOKEN_EXPIRY_DAYS = 30

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createRememberToken(
  userId: string,
  userAgent: string | null,
  ipAddress: string | null,
): Promise<void> {
  const db = createAdminClient()
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // Parse user agent for device name
  const deviceName = userAgent?.includes('Mobile') ? 'Mobil' : userAgent?.includes('Mac') ? 'Mac' : userAgent?.includes('Windows') ? 'Windows' : 'Unbekannt'

  await db.from('auth_remember_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    user_agent: userAgent?.slice(0, 500) ?? null,
    ip_address: ipAddress,
    device_name: deviceName,
    expires_at: expiresAt.toISOString(),
  })

  // Cookie setzen
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, `${userId}:${rawToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  })
}

export async function validateRememberToken(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)?.value
  if (!cookie) return false

  const [cookieUserId, rawToken] = cookie.split(':')
  if (cookieUserId !== userId || !rawToken) return false

  const tokenHash = hashToken(rawToken)
  const db = createAdminClient()

  const { data } = await db
    .from('auth_remember_tokens')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('token_hash', tokenHash)
    .is('revoked_am', null)
    .single()

  if (!data || new Date(data.expires_at) < new Date()) return false

  // Update last_used_at
  await db.from('auth_remember_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)

  return true
}

export async function revokeRememberToken(tokenId: string): Promise<void> {
  const db = createAdminClient()
  await db.from('auth_remember_tokens').update({ revoked_am: new Date().toISOString() }).eq('id', tokenId)
}

export async function revokeAllTokens(userId: string): Promise<void> {
  const db = createAdminClient()
  await db.from('auth_remember_tokens').update({ revoked_am: new Date().toISOString() }).eq('user_id', userId).is('revoked_am', null)

  // Cookie löschen
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function listUserDevices(userId: string): Promise<{
  id: string; device_name: string | null; ip_address: string | null; last_used_at: string; created_at: string
}[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('auth_remember_tokens')
    .select('id, device_name, ip_address, last_used_at, created_at')
    .eq('user_id', userId)
    .is('revoked_am', null)
    .order('last_used_at', { ascending: false })
  return (data ?? []) as { id: string; device_name: string | null; ip_address: string | null; last_used_at: string; created_at: string }[]
}

export async function clearTwoFa(targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const db = createAdminClient()
  await db.from('profiles').update({
    twofa_telefon: null,
    twofa_telefon_verifiziert_am: null,
  }).eq('id', targetUserId)
  await revokeAllTokens(targetUserId)
  return { success: true }
}
