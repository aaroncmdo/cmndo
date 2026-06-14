import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import TwoFaClient from './TwoFaClient'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue, LOGIN_CONTINUE_COOKIE } from '@/lib/auth/safe-continue'

// AAR-939: 2FA via Supabase-MFA (Phone-Faktor). Diese Page unterscheidet drei
// Fälle und rendert den passenden Modus:
//   - verifizierter Phone-Faktor vorhanden  -> 'challenge' (SMS-Code verifizieren)
//   - Legacy-2FA gewollt, aber kein Faktor   -> 'enroll' (Soft-Enroll, vorausgefüllt)
//   - sonst (kein Faktor, kein Legacy-Flag)  -> direkt ins Ziel (kein 2FA)
// Google-Login überspringt 2FA komplett.
//
// Anders als früher gibt es KEINEN claimondo_2fa_verified-Cookie mehr — das
// Durchlassen entscheidet die Middleware über die Session-AAL.

export default async function TwoFaPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Kein User = kein Login = zurück zum Login
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, twofa_telefon, telefon, twofa_aktiviert, twofa_email_aktiviert')
    .eq('id', user.id)
    .single()

  const targetPath = roleToPath(profile?.rolle as string | null | undefined)
  // AAR-login-embed: continue überlebt den 2FA-Hop via kurzlebigem Cookie.
  const cont = safeContinue((await cookies()).get(LOGIN_CONTINUE_COOKIE)?.value)
  const finalTarget = cont ?? targetPath

  // Google-Login: kein Custom-2FA.
  if (user.app_metadata?.provider === 'google') redirect(finalTarget)

  // Verifizierten Phone-Faktor suchen.
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const verifiedPhone = (factors?.all ?? []).find(
    (f) => f.factor_type === 'phone' && f.status === 'verified',
  )

  if (verifiedPhone) {
    // CHALLENGE-Modus: Faktor existiert → SMS-Code verifizieren.
    const telefon = profile?.twofa_telefon ?? profile?.telefon ?? null
    const maskedPhone = telefon
      ? telefon.slice(0, 4) + '****' + telefon.slice(-3)
      : null
    return (
      <TwoFaClient
        mode="challenge"
        factorId={verifiedPhone.id}
        maskedPhone={maskedPhone}
        targetPath={finalTarget}
      />
    )
  }

  const legacyWanted =
    profile?.twofa_aktiviert === true || profile?.twofa_email_aktiviert === true

  if (legacyWanted) {
    // SOFT-ENROLL-Modus: Legacy-2FA-User ohne Supabase-Faktor holt ihn nach.
    // Soft = überspringbar; die Middleware lässt faktor-lose User ohnehin durch.
    return (
      <TwoFaClient
        mode="enroll"
        prefillPhone={profile?.twofa_telefon ?? profile?.telefon ?? null}
        targetPath={finalTarget}
      />
    )
  }

  // Kein Faktor + kein Legacy-Flag → kein 2FA. Direkt ins Ziel (die Middleware
  // ließe ohnehin durch).
  redirect(finalTarget)
}
