import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import TwoFaClient from './TwoFaClient'
import TwoFaSkipRedirect from './TwoFaSkipRedirect'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue, LOGIN_CONTINUE_COOKIE } from '@/lib/auth/safe-continue'

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
  // AAR-login-embed: continue ueberlebt den 2FA-Hop via kurzlebigem Cookie
  // (in login/actions.ts gesetzt). Hat Vorrang vor roleToPath.
  const cont = safeContinue((await cookies()).get(LOGIN_CONTINUE_COOKIE)?.value)
  const finalTarget = cont ?? targetPath

  // Wenn Google-Login: 2FA ueberspringen — direkt ins Ziel.
  if (user.app_metadata?.provider === 'google') redirect(finalTarget)

  // 2FA nicht aktiviert → NICHT per Server-`redirect()` ins Portal: eine
  // Server-Component kann kein Cookie setzen, also sieht die Middleware beim
  // Ziel-Pfad weiterhin kein `claimondo_2fa_verified` und wirft sofort wieder
  // auf /login/2fa = Endlos-Reload-Loop (reproduziert 31.05.: 18 /login/2fa-
  // Navigationen in 6s, wenn das Cookie fehlt/abgelaufen ist). Stattdessen die
  // Bridge rendern: sie setzt das Cookie via Server-Action `markTwoFaSkipForInactive`
  // UND navigiert dann hart — beim nächsten Middleware-Hit ist das Cookie da,
  // der Bounce ist gebrochen. (Der Bridge-Pfad existierte, war aber nie verdrahtet.)
  if (profile?.twofa_aktiviert === false && profile?.twofa_email_aktiviert === false) {
    return <TwoFaSkipRedirect targetPath={finalTarget} />
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
      targetPath={finalTarget}
    />
  )
}
