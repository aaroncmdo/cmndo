import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TwoFaClient from './TwoFaClient'
import { roleToPath } from '@/lib/auth/role-redirect'

// KFZ-184: 2FA SMS-Code Eingabe nach Email+Passwort Login.
// AAR-494: Email-OTP als alternative Methode, wenn aktiviert (oder als Fallback
// ohne Telefon).
// AAR-718: Redirect-Targets auf roleToPath(rolle) umgestellt — vorher gingen
// drei Pfade auf `/`, was authentifizierte User auf der Landing-Page statt
// in ihrem Portal landen ließ (mit verwirrendem „Zu meinem Portal"-Button).
// Der Bug-Class ist der gleiche wie in role-redirect.ts Zeile 5 beschrieben.

export default async function TwoFaPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Kein User = kein Login = zurueck zum Login
  if (!user) redirect('/login')

  // AAR-718: Profil früh laden — wird sowohl für roleToPath als auch für die
  // 2FA-Flag-Checks benötigt.
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, twofa_telefon, telefon, twofa_aktiviert, twofa_email_aktiviert')
    .eq('id', user.id)
    .single()

  const targetPath = roleToPath(profile?.rolle as string | null | undefined)

  // Wenn Google-Login: 2FA ueberspringen — direkt ins Rollen-Portal.
  if (user.app_metadata?.provider === 'google') redirect(targetPath)

  // 2FA nicht aktiviert: direkt ins Rollen-Portal (Middleware-Cookie wird in
  // der Login-Action gesetzt, AAR-562). Wenn der Cookie abgelaufen ist und
  // der User hier landet, sendet er sich selbst in den nächsten Loop — deshalb
  // redirect auf das echte Portal, nicht auf `/` (sonst Landing-Page).
  if (profile?.twofa_aktiviert === false && profile?.twofa_email_aktiviert === false) {
    redirect(targetPath)
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
      targetPath={targetPath}
    />
  )
}
