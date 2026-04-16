'use server'

// AAR-344 Pfad A: Self-Service 2FA-Nummern-Änderung für eingeloggte User.
// Zwei-Stufen-Flow:
//   1. initPhoneChange(newPhone) → sendet SMS-Code an die NEUE Nummer
//   2. confirmPhoneChange(newPhone, code) → verifiziert Code + speichert Nummer

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendVerificationCode, checkVerificationCode } from '@/lib/twilio/verify-client'
import { revalidatePath } from 'next/cache'
import { revokeAllTokens } from './remember-me'

function normalizeE164(input: string): string {
  const cleaned = input.replace(/\s/g, '').replace(/-/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2)
  if (cleaned.startsWith('0')) return '+49' + cleaned.slice(1)
  return '+' + cleaned
}

export async function initPhoneChange(
  newPhone: string,
): Promise<{ success: boolean; error?: string; normalized?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const clean = newPhone.trim()
  if (!clean) return { success: false, error: 'Bitte Telefonnummer eingeben' }
  const normalized = normalizeE164(clean)
  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    return { success: false, error: 'Ungültiges Nummern-Format (E.164 erwartet)' }
  }

  const result = await sendVerificationCode(normalized)
  if (!result.success) {
    return { success: false, error: result.error ?? 'SMS-Versand fehlgeschlagen' }
  }
  return { success: true, normalized }
}

export async function confirmPhoneChange(
  newPhone: string,
  code: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const normalized = normalizeE164(newPhone.trim())
  const cleanCode = code.trim()
  if (!cleanCode) return { success: false, error: 'Code fehlt' }

  const verify = await checkVerificationCode(normalized, cleanCode)
  if (!verify.success) {
    return { success: false, error: verify.error ?? 'Code ungültig' }
  }

  const admin = createAdminClient()
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      twofa_telefon: normalized,
      twofa_telefon_verifiziert_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
  if (updErr) return { success: false, error: updErr.message }

  // Alle anderen Remember-Me-Tokens widerrufen — der User hat seine 2FA-Basis
  // gewechselt, also ist eine frische SMS-Verifizierung auf allen Geräten
  // angebracht.
  await revokeAllTokens(user.id)

  // Audit-Eintrag in timeline (system-level, kein fall_id)
  await admin.from('timeline').insert({
    typ: 'system',
    titel: '2FA-Telefonnummer vom User geändert',
    beschreibung: `Neue Nummer auf ${maskPhone(normalized)} bestätigt. Alle Remember-Me-Sessions wurden widerrufen.`,
    erstellt_von: user.id,
  })

  revalidatePath('/admin/profil')
  revalidatePath('/gutachter/profil')
  revalidatePath('/kunde/profil')
  return { success: true }
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '•••••' + phone.slice(-3)
}
