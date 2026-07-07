'use server'

import { createClient } from '@/lib/supabase/server'
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

/**
 * AAR-152 Fix: Die alte Signatur erwartete `userId` als ersten Parameter — der
 * TwoFaClient hat aber `''` übergeben (Kommentar „userId wird serverseitig
 * gelesen"). Das Insert auf `auth_remember_tokens.user_id` (uuid NOT NULL)
 * failte stumm mit 'invalid input syntax for type uuid', und das Cookie wurde
 * mit Format `:${rawToken}` gesetzt. Dadurch hat Remember-Me NIE funktioniert
 * und die Middleware hat den User beim Tab-Close immer wieder zur 2FA gezwungen.
 *
 * Jetzt wird `userId` tatsächlich aus der Supabase-Session gelesen. Der erste
 * Parameter bleibt aus Backward-Compat-Gründen erhalten, wird aber ignoriert.
 */
export async function createRememberToken(
  _legacyUserId: string,
  userAgent: string | null,
  ipAddress: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  const deviceName = userAgent?.includes('Mobile')
    ? 'Mobil'
    : userAgent?.includes('Mac')
      ? 'Mac'
      : userAgent?.includes('Windows')
        ? 'Windows'
        : 'Unbekannt'

  const { error } = await db.from('auth_remember_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    user_agent: userAgent?.slice(0, 500) ?? null,
    ip_address: ipAddress,
    device_name: deviceName,
    expires_at: expiresAt.toISOString(),
  })
  if (error) return { success: false, error: error.message }

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, `${user.id}:${rawToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
  })

  return { success: true }
}

// AAR-auth-haertung: validateRememberToken (Edge-sichere Validierung) lebt jetzt
// in @/lib/auth/twofa/validate-remember-token und wird von der Middleware
// genutzt. Die fruehere next/headers + node:crypto-Variante hier war totcode
// (0 Aufrufer) UND edge-untauglich (Middleware konnte sie nie aufrufen) — genau
// deshalb prüfte die Middleware das Cookie nur auf Existenz (2FA-Bypass).

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
  // F6 (AAR-audit-2fa): Auch die echten Supabase-MFA-Faktoren entfernen — sonst
  // bleibt der User trotz "2FA zurueckgesetzt" gechallenged/ausgesperrt (der
  // profiles-Mirror allein hebt aal2 nicht auf). Admin-MFA-API (service role),
  // idempotent: kein Faktor -> no-op.
  try {
    const { data } = await db.auth.admin.mfa.listFactors({ userId: targetUserId })
    for (const f of data?.factors ?? []) {
      await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: targetUserId })
    }
  } catch (err) {
    console.error('[clearTwoFa] MFA-Faktor-Delete fehlgeschlagen:', err)
  }
  await db.from('profiles').update({
    twofa_telefon: null,
    twofa_telefon_verifiziert_am: null,
    twofa_aktiviert: false,
  }).eq('id', targetUserId)
  await revokeAllTokens(targetUserId)
  return { success: true }
}
