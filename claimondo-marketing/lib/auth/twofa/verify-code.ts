'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkVerificationCode } from '@/lib/twilio/verify-client'

// KFZ-184: SMS-Code verifizieren + optional Telefon als 2FA-Nummer speichern.

const failCountMap = new Map<string, { count: number; lockedUntil: number }>()

export async function verifyTwoFaCode(code: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet', success: false }

  // Lockout check (3x falsch = 5 Min Sperre)
  const key = user.id
  const fail = failCountMap.get(key)
  if (fail && fail.lockedUntil > Date.now()) {
    const remaining = Math.ceil((fail.lockedUntil - Date.now()) / 60000)
    return { error: `Zu viele Fehlversuche. Bitte ${remaining} Min warten.`, success: false }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_telefon, telefon')
    .eq('id', user.id)
    .single()

  const telefon = profile?.twofa_telefon ?? profile?.telefon
  if (!telefon) return { error: 'Keine Telefonnummer', success: false }

  const result = await checkVerificationCode(telefon, code)

  if (!result.success) {
    const f = failCountMap.get(key) ?? { count: 0, lockedUntil: 0 }
    f.count++
    if (f.count >= 3) f.lockedUntil = Date.now() + 5 * 60 * 1000
    failCountMap.set(key, f)
    return { error: 'Ungültiger Code', success: false }
  }

  // Reset fail count
  failCountMap.delete(key)

  // AAR-2fa-loop-fix: 3-Tage-Persistenz statt Session-Cookie. Session-
  // Cookies waren in Production unzuverlässig (Mobile-Browser, Vercel-Edge)
  // und führten zu Reload-Loops wenn das Cookie zwischen Set und nächstem
  // Request verloren ging. Aarons „2FA pro Anmeldung"-Spec bleibt intakt:
  // Login-Action löscht das Cookie explizit beim nächsten Login-Submit,
  // bevor zur 2FA-Page weitergeleitet wird.
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set('claimondo_2fa_verified', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3 * 24 * 60 * 60,
  })

  return { success: true }
}

export async function confirmPhoneVerification(telefon: string, code: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet', success: false }

  const result = await checkVerificationCode(telefon, code)
  if (!result.success) return result

  // Telefon als 2FA-Nummer speichern
  const db = createAdminClient()
  await db.from('profiles').update({
    twofa_telefon: telefon,
    twofa_telefon_verifiziert_am: new Date().toISOString(),
  }).eq('id', user.id)

  return { success: true }
}
