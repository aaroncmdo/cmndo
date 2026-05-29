'use server'

import { createClient } from '@/lib/supabase/server'
import { sendVerificationCode } from '@/lib/twilio/verify-client'

// KFZ-184: SMS-Code senden fuer 2FA.

export async function requestTwoFaCode(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet', success: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_telefon, telefon')
    .eq('id', user.id)
    .single()

  const telefon = profile?.twofa_telefon ?? profile?.telefon
  if (!telefon) return { error: 'Keine Telefonnummer hinterlegt', success: false }

  return sendVerificationCode(telefon)
}

export async function requestPhoneVerification(telefon: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { error: 'Nicht angemeldet', success: false }

  return sendVerificationCode(telefon)
}
