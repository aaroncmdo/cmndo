'use server'

import { createClient } from '@/lib/supabase/server'
import { toE164 } from '@/lib/format/telefon'

// AAR-phone-login (Phase 2): Selbst-Service Telefon-Login-Aktivierung fuer JEDE
// Rolle, entkoppelt von 2FA. Nutzt Supabase-natives phone_change auf der eigenen
// User-Session (SSR): updateUser({phone}) sendet einen OTP -> verifyOtp(type:
// 'phone_change') setzt auth.users.phone. KEIN MFA-Faktor -> 2FA bleibt unberuehrt.
export type PhoneLoginResult = { ok: true } | { ok: false; error: string }

/** Loest den phone_change-OTP fuer die neue Login-Nummer aus (SMS an die Nummer). */
export async function starteTelefonLoginVerify(phone: string): Promise<PhoneLoginResult> {
  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'Bitte eine gültige Telefonnummer eingeben.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ phone: e164 })
  if (error) return { ok: false, error: uebersetzePhoneLoginFehler(error.message) }
  return { ok: true }
}

/** Bestaetigt den SMS-Code (phone_change) -> auth.users.phone gesetzt + bestaetigt. */
export async function bestaetigeTelefonLoginVerify(phone: string, code: string): Promise<PhoneLoginResult> {
  const e164 = toE164(phone)
  if (!e164) return { ok: false, error: 'Bitte eine gültige Telefonnummer eingeben.' }
  const sauber = code.replace(/\D/g, '').slice(0, 6)
  if (sauber.length !== 6) return { ok: false, error: 'Bitte den 6-stelligen Code eingeben.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: sauber, type: 'phone_change' })
  if (error) return { ok: false, error: uebersetzePhoneLoginFehler(error.message) }
  return { ok: true }
}

// Lokaler Helfer (NICHT exportiert — 'use server' erlaubt nur async Exports).
function uebersetzePhoneLoginFehler(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('already') || m.includes('registered') || m.includes('duplicate') || m.includes('unique')) {
    return 'Diese Nummer ist bereits einem anderen Konto zugeordnet.'
  }
  if (m.includes('invalid') && (m.includes('code') || m.includes('otp') || m.includes('token'))) {
    return 'Ungültiger oder abgelaufener Code.'
  }
  if (m.includes('expired')) return 'Der Code ist abgelaufen. Bitte einen neuen anfordern.'
  if (m.includes('rate') || m.includes('too many') || m.includes('limit')) {
    return 'Zu viele Versuche. Bitte später erneut versuchen.'
  }
  return 'Aktion fehlgeschlagen. Bitte erneut versuchen.'
}
