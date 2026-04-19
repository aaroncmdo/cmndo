import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TwoFaClient from './TwoFaClient'

// KFZ-184: 2FA SMS-Code Eingabe nach Email+Passwort Login.
// AAR-494: Email-OTP als alternative Methode, wenn aktiviert (oder als Fallback
// ohne Telefon).

async function setzeZweiFaCookie() {
  // AAR-562: Wenn 2FA nicht aktiv ist, setzen wir trotzdem das
  // claimondo_2fa_verified-Cookie — sonst redirected die Middleware
  // jeden /admin/*-Request zurück auf /login/2fa und wir landen in einer
  // Endlosschleife (2fa → /, / → /admin/* → /login/2fa → ...).
  const cookieStore = await cookies()
  cookieStore.set('claimondo_2fa_verified', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3 * 24 * 60 * 60,
  })
}

export default async function TwoFaPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Kein User = kein Login = zurueck zum Login
  if (!user) redirect('/login')

  // Wenn Google-Login: 2FA ueberspringen
  if (user.app_metadata?.provider === 'google') {
    await setzeZweiFaCookie()
    redirect('/')
  }

  // Profile laden für Telefon-Anzeige und Email-2FA-Flag
  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_telefon, telefon, twofa_aktiviert, twofa_email_aktiviert')
    .eq('id', user.id)
    .single()

  // 2FA nicht aktiviert: direkt durch
  if (profile?.twofa_aktiviert === false && profile?.twofa_email_aktiviert === false) {
    await setzeZweiFaCookie()
    redirect('/')
  }

  const telefon = profile?.twofa_telefon ?? profile?.telefon
  const maskedPhone = telefon
    ? telefon.slice(0, 4) + '****' + telefon.slice(-3)
    : null

  const email = user.email ?? null
  const maskedEmail = email
    ? email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
    : null

  // AAR-494: Methoden-Verfügbarkeit
  const smsVerfuegbar = Boolean(telefon) && profile?.twofa_aktiviert !== false
  const emailVerfuegbar = profile?.twofa_email_aktiviert === true && Boolean(email)

  // Wenn nur eine Methode verfügbar ist, direkt diese vorauswählen.
  // Wenn keine Telefonnummer da ist aber Email-Konto — Email als Fallback.
  const initialMethod: 'sms' | 'email' =
    smsVerfuegbar ? 'sms' : 'email'

  return (
    <TwoFaClient
      maskedPhone={maskedPhone}
      maskedEmail={maskedEmail}
      smsVerfuegbar={smsVerfuegbar}
      emailVerfuegbar={emailVerfuegbar || !smsVerfuegbar}
      initialMethod={initialMethod}
    />
  )
}
