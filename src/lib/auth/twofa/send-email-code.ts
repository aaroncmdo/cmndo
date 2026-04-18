'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash, randomInt } from 'crypto'
import { resend, isResendAvailable } from '@/lib/email/resend-client'
import TwoFactorCodeEmail, {
  subject as twoFactorSubject,
} from '@/lib/email/google/templates/TwoFactorCode'

// AAR-494: Email-OTP senden als alternative 2FA-Methode.
//
// Rate-Limit: max. 3 Codes pro Stunde und Nutzer (verhindert Versand-Missbrauch
// und schützt unsere Resend-Quota).
// Code: 6 Ziffern, sha256-gehasht in email_otp_codes, 5 Min Gültigkeit.
// Kein Klartext-Code in der DB — nur der Hash.

const FROM = 'Claimondo <noreply@claimondo.de>'
const CODE_TTL_MINUTEN = 5
const RATE_LIMIT_PRO_STUNDE = 3

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function generateCode(): string {
  // 6-stellig, führende Nullen erlaubt
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export async function requestEmailOtp(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }
  if (!user.email) return { success: false, error: 'Kein E-Mail-Konto hinterlegt' }

  if (!isResendAvailable() || !resend) {
    console.error('[AAR-494] RESEND_API_KEY fehlt — Email-OTP nicht versendbar')
    return { success: false, error: 'E-Mail-Versand nicht konfiguriert' }
  }

  const db = createAdminClient()

  // Rate-Limit-Check: Anzahl Codes in der letzten Stunde
  const vorStunde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await db
    .from('email_otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gt('created_at', vorStunde)

  if ((recentCount ?? 0) >= RATE_LIMIT_PRO_STUNDE) {
    return {
      success: false,
      error: `Zu viele Code-Anfragen. Bitte in einer Stunde erneut versuchen.`,
    }
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTEN * 60 * 1000)

  const { error: insertErr } = await db.from('email_otp_codes').insert({
    user_id: user.id,
    code_hash: hashCode(code),
    expires_at: expiresAt.toISOString(),
  })
  if (insertErr) {
    console.error('[AAR-494] Insert-Fehler email_otp_codes:', insertErr)
    return { success: false, error: 'Code konnte nicht erzeugt werden' }
  }

  // Profil für Vornamen
  const { data: profile } = await db
    .from('profiles')
    .select('vorname')
    .eq('id', user.id)
    .single()

  const props = {
    vorname: profile?.vorname ?? null,
    code,
    gueltigMinuten: CODE_TTL_MINUTEN,
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: user.email,
      subject: twoFactorSubject(props),
      react: TwoFactorCodeEmail(props),
    })
    if (error) {
      console.error('[AAR-494] Resend-Fehler Email-OTP:', error)
      return { success: false, error: 'E-Mail-Versand fehlgeschlagen' }
    }
  } catch (err) {
    console.error('[AAR-494] Versand-Exception Email-OTP:', err)
    return { success: false, error: 'E-Mail-Versand fehlgeschlagen' }
  }

  return { success: true }
}

const failCountMap = new Map<string, { count: number; lockedUntil: number }>()

export async function verifyEmailOtp(code: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const key = user.id
  const fail = failCountMap.get(key)
  if (fail && fail.lockedUntil > Date.now()) {
    const remaining = Math.ceil((fail.lockedUntil - Date.now()) / 60000)
    return { success: false, error: `Zu viele Fehlversuche. Bitte ${remaining} Min warten.` }
  }

  const normalized = code.replace(/\D/g, '').slice(0, 6)
  if (normalized.length !== 6) {
    return { success: false, error: 'Bitte 6-stelligen Code eingeben' }
  }

  const db = createAdminClient()
  const { data: entry } = await db
    .from('email_otp_codes')
    .select('id, code_hash, expires_at, verifiziert_am')
    .eq('user_id', user.id)
    .is('verifiziert_am', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!entry || entry.code_hash !== hashCode(normalized)) {
    const f = failCountMap.get(key) ?? { count: 0, lockedUntil: 0 }
    f.count++
    if (f.count >= 3) f.lockedUntil = Date.now() + 5 * 60 * 1000
    failCountMap.set(key, f)
    return { success: false, error: 'Ungültiger Code' }
  }

  await db
    .from('email_otp_codes')
    .update({ verifiziert_am: new Date().toISOString() })
    .eq('id', entry.id)

  failCountMap.delete(key)

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
