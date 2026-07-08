'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { safeContinue, LOGIN_CONTINUE_COOKIE } from '@/lib/auth/safe-continue'
import { entscheideLoginRouting } from '@/lib/auth/mfa-gate'

// BUG-83 Befund 7: gleiche Konstante wie in supabase/server.ts.
const REMEMBER_COOKIE_NAME = 'cm_remember'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  // BUG-83 Befund 7: Checkbox-Wert. Default OFF (Session-Cookie) — nur wenn
  // der User aktiv "Angemeldet bleiben" angekreuzt hat, persistieren wir
  // langfristig.
  const remember = formData.get('remember') === 'on'
  // AAR-login-embed: optionales ?continue= (Login-Widget / Marketing-Header).
  const cont = safeContinue(formData.get('continue') as string | null)

  if (!email || !password) {
    redirect('/login?error=E-Mail+und+Passwort+sind+erforderlich')
  }

  // Marker-Cookie BEVOR wir den Supabase-Client erstellen — der Client liest
  // ihn fuer cookieOptions, und auch die Middleware nutzt ihn bei
  // spaeteren Token-Rotationen.
  const cookieStore = await cookies()
  // AAR-login-loop: Domain auf .claimondo.de setzen damit alle Subdomains
  // (claimondo.de, app.claimondo.de) dieselben Cookies sehen.
  const cookieDomain = process.env.NODE_ENV === 'production' ? '.claimondo.de' : undefined
  cookieStore.set(REMEMBER_COOKIE_NAME, remember ? '1' : '0', {
    path: '/',
    sameSite: 'lax',
    // Marker-Cookie selbst lebt 1 Jahr — wir muessen wissen, was der User
    // gewaehlt hat, auch wenn die Auth-Cookies Session-Cookies sind.
    // (Bei Logout wird er via supabase signOut nicht entfernt; das ist OK,
    // er hat ohne Auth-Cookies keine Wirkung.)
    maxAge: ONE_YEAR_SECONDS,
    domain: cookieDomain,
  })

  // AAR-login-embed: continue ueber den 2FA-/Passwort-Aendern-Hop tragen
  // (kurzlebig, httpOnly). 2fa/page.tsx + /passwort-aendern lesen es; das finale
  // redirect unten nutzt es direkt.
  if (cont) {
    cookieStore.set(LOGIN_CONTINUE_COOKIE, cont, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      domain: cookieDomain,
    })
  }

  const supabase = await createClient({ remember })

  // AAR-621: signInWithPassword liefert `data.user` direkt — vorher wurde
  // danach zusätzlich `supabase.auth.getUser()` aufgerufen, was einen
  // zweiten Auth-Roundtrip kostete ohne neue Information. Ein Roundtrip
  // gespart (≈ 200-500 ms je nach DB-Auslastung).
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    // AAR-auth-haertung (Befund G): rohe Supabase-Fehlermeldung nicht an den
    // User durchreichen — generisch anzeigen, Detail nur ins Server-Log.
    console.error('[login] signInWithPassword fehlgeschlagen:', signInError.message)
    redirect('/login?error=E-Mail+oder+Passwort+ist+falsch')
  }

  const user = signInData.user
  if (!user) {
    redirect('/login?error=Kein+Benutzer+gefunden')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rolle, force_password_change, auth_provider')
    .eq('id', user.id)
    .single()

  if (profileError) {
    // AAR-auth-haertung (Befund G): DB-Fehlerdetail nur ins Log, nicht in die URL.
    console.error('Profile query failed:', profileError.message, '| User:', user.id)
    redirect('/login?error=Profil+konnte+nicht+geladen+werden')
  }

  if (!profile?.rolle) {
    redirect('/login?error=Keine+Rolle+im+Profil+hinterlegt')
  }

  // AAR-621: Ziel-Pfad einmal früh berechnen — wird sowohl für Cache-
  // Invalidierung als auch für den finalen Redirect verwendet.
  const targetPath = roleToPath(profile.rolle)

  // Check if password change is required (only for email auth)
  const authProvider = profile.auth_provider ?? 'email'
  if (profile.force_password_change && authProvider === 'email') {
    // BUG-82: Vor dem Redirect den Cache invalidieren — sonst serviert
    // der Next.js Router-Cache die alte (logged-out) RSC-Payload.
    // AAR-621: Scope eingegrenzt — vorher '/' mit 'layout' (invalidiert
    // den gesamten App-Tree), jetzt nur der /passwort-aendern-Pfad den
    // wir gleich anspringen. Spart das Re-Rendern aller anderen Routes.
    revalidatePath('/passwort-aendern', 'layout')
    redirect('/passwort-aendern')
  }

  // AAR-939: 2FA läuft jetzt über Supabase-MFA (AAL), nicht mehr über den
  // claimondo_2fa_verified-Cookie. Routing-Entscheidung anhand Faktor-Existenz
  // + Legacy-Flags: nextLevel='aal2' <=> es existiert ein verifizierter Faktor.
  // getAuthenticatorAssuranceLevel() ist lokal (JWT-Decode), kein Extra-Call.
  // „2FA pro Anmeldung" bleibt automatisch erfüllt: ein frischer Login startet
  // immer auf aal1, der zweite Faktor wird auf /login/2fa nachgeholt (außer
  // Trusted-Device via claimondo_remember — das prüft die Middleware).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const routing = entscheideLoginRouting({
    isGoogleUser: authProvider === 'google',
    hasVerifiedFactor: aal?.nextLevel === 'aal2',
  })

  if (routing !== 'portal') {
    // routing === 'challenge': vorhandenen Faktor auf /login/2fa verifizieren.
    revalidatePath('/login/2fa', 'layout')
    redirect('/login/2fa')
  }

  // routing === 'portal' → kein zweiter Faktor nötig.
  // BUG-82: revalidatePath vor dem redirect() ist NOTWENDIG damit der
  // Next.js Router-Cache die alte RSC-Payload fuer den Ziel-Pfad
  // (z.B. /gutachter, das vor dem Login als 'redirect to /login' gecached
  // wurde) verwirft.
  //
  // CMM-14: 'layout'-Type triggerte deterministisch 502 Bad Gateway bei
  // rolle='sachverstaendiger' (Login-Server-Action upstream-crash). Andere
  // Rollen mit demselben Code-Pfad gehen mit 303. Hypothese: Layout-Cache-
  // Invalidate-Race mit dem Supabase-Cookie-Adapter im noch-laufenden
  // Server-Action-Cycle. 'page' ist enger scoped — invalidate nur die Page-
  // RSC. Layout wird beim nächsten Render eh frisch geladen, die Cache-
  // Sicherheit bleibt erhalten.
  revalidatePath(targetPath, 'page')
  // AAR-login-embed: validiertes continue hat Vorrang (kein 2FA -> direkt hier).
  redirect(cont ?? targetPath)
}

/**
 * AAR-auth-haertung (Befund I): Finalisiert den Phone-OTP-Login serverseitig.
 * Vorher schrieb LoginClient auth_provider + force_password_change direkt auf
 * dem Browser-Client OHNE Error-Check (stilles Scheitern -> ein Phone-User
 * konnte faelschlich auf /passwort-aendern landen). Jetzt serverseitig mit
 * Result-Object; der Caller (LoginClient) ruft es direkt nach verifyOtp auf.
 */
export async function finalisierePhoneLogin(): Promise<
  { ok: true; redirectTo: string } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet. Bitte erneut anmelden.' }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ auth_provider: 'phone', force_password_change: false })
    .eq('id', user.id)
  if (updateError) {
    console.error('[finalisierePhoneLogin] profiles update fehlgeschlagen:', updateError.message)
    return { ok: false, error: 'Profil konnte nicht aktualisiert werden. Bitte erneut versuchen.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  return { ok: true, redirectTo: roleToPath(profile?.rolle as string | null | undefined) }
}
