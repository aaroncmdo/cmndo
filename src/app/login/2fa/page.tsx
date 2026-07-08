import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import TwoFaClient from './TwoFaClient'
import TotpChallengeClient from './TotpChallengeClient'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue, LOGIN_CONTINUE_COOKIE } from '@/lib/auth/safe-continue'
import { waehleZweitFaktor } from '@/lib/auth/mfa-gate'

// AAR-939: 2FA via Supabase-MFA. Faktor-Wahl (waehleZweitFaktor):
//   - TOTP-Faktor vorhanden        -> TotpChallengeClient (Code aus Authenticator-App)
//   - Phone bevorzugt / ?factor=phone -> TwoFaClient challenge (SMS)
//   - Legacy/kein Faktor           -> direkt ins Ziel (2FA optional, kein Zwang)
//   - sonst                        -> direkt ins Ziel (kein 2FA)
// TOTP wird bevorzugt; bei zusätzlichem Phone-Faktor gibt es einen
// „Stattdessen SMS"-Fallback (Navigation auf /login/2fa?factor=phone).
// Google-Login überspringt 2FA. Durchlassen entscheidet die Middleware/AAL.

export default async function TwoFaPage({
  searchParams,
}: {
  searchParams: Promise<{ factor?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Kein User = kein Login = zurück zum Login
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, twofa_telefon, telefon')
    .eq('id', user.id)
    .single()

  const targetPath = roleToPath(profile?.rolle as string | null | undefined)
  // AAR-login-embed: continue überlebt den 2FA-Hop via kurzlebigem Cookie.
  const cont = safeContinue((await cookies()).get(LOGIN_CONTINUE_COOKIE)?.value)
  const finalTarget = cont ?? targetPath

  // Google-Login: kein Custom-2FA.
  if (user.app_metadata?.provider === 'google') redirect(finalTarget)

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const wahl = waehleZweitFaktor(factors?.all ?? [])
  const forcePhone = (await searchParams)?.factor === 'phone'

  // TOTP bevorzugt (außer der User hat bewusst auf SMS umgeschaltet).
  if (wahl.preferred === 'totp' && wahl.totpId && !forcePhone) {
    return (
      <TotpChallengeClient
        totpFactorId={wahl.totpId}
        smsFallbackHref={wahl.hasSmsFallback ? '/login/2fa?factor=phone' : null}
        targetPath={finalTarget}
      />
    )
  }

  // Phone-Challenge: preferred=phone ODER der User hat auf SMS umgeschaltet.
  if (wahl.phoneId && (wahl.preferred === 'phone' || forcePhone)) {
    const telefon = profile?.twofa_telefon ?? profile?.telefon ?? null
    const maskedPhone = telefon ? telefon.slice(0, 4) + '****' + telefon.slice(-3) : null
    return (
      <TwoFaClient
        mode="challenge"
        factorId={wahl.phoneId}
        maskedPhone={maskedPhone}
        targetPath={finalTarget}
      />
    )
  }

  // Kein verifizierter Faktor -> 2FA ist optional, kein erzwungener Enroll.
  // Die 2FA-Einrichtung passiert opt-in in den Konto-Einstellungen (B1).
  redirect(finalTarget)
}
