'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'

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

  const supabase = await createClient({ remember })

  // AAR-621: signInWithPassword liefert `data.user` direkt — vorher wurde
  // danach zusätzlich `supabase.auth.getUser()` aufgerufen, was einen
  // zweiten Auth-Roundtrip kostete ohne neue Information. Ein Roundtrip
  // gespart (≈ 200-500 ms je nach DB-Auslastung).
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password })

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`)
  }

  const user = signInData.user
  if (!user) {
    redirect('/login?error=Kein+Benutzer+gefunden')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rolle, force_password_change, auth_provider, twofa_aktiviert, twofa_email_aktiviert')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Profile query failed:', profileError.message, '| User:', user.id)
    redirect(`/login?error=${encodeURIComponent('Profil konnte nicht geladen werden: ' + profileError.message)}`)
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

  // AAR-2fa-fix: Alte 2FA-Bestätigung beim Login-Submit IMMER löschen.
  // Aaron-Spec: 2FA soll bei jeder Anmeldung getriggert werden — außer
  // der User hat „Angemeldet bleiben" gewählt (claimondo_remember-Token).
  // Wir nutzen explizit `set` mit `maxAge: 0` statt `delete()` — letzteres
  // hatte in Production Race-Conditions mit dem Supabase-Cookie-Adapter,
  // der parallel auf demselben cookieStore arbeitet.
  cookieStore.set('claimondo_2fa_verified', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    domain: cookieDomain,
  })

  // 2FA aktiv? → direkt nach /login/2fa, nicht über Browser-Roundtrip
  // via Middleware. Spart eine Redirect-Runde + verhindert Race-Conditions
  // mit Cookie-Setzen in Server Action.
  const zweiFaAktiv =
    profile.twofa_aktiviert === true || profile.twofa_email_aktiviert === true
  if (zweiFaAktiv) {
    revalidatePath('/login/2fa', 'layout')
    redirect('/login/2fa')
  }

  // 2FA inaktiv → Cookie setzen damit Middleware nicht zu /login/2fa
  // schickt. 3-Tage-Persistenz statt Session-Cookie: Mobile-Browser und
  // Vercel-Edge können Session-Cookies in seltenen Fällen verlieren →
  // Loop. Beim nächsten echten Login wird das Cookie ohnehin durch das
  // explicit set(maxAge=0) oben weggeräumt → „2FA pro Anmeldung" bleibt.
  cookieStore.set('claimondo_2fa_verified', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3 * 24 * 60 * 60,
    domain: cookieDomain,
  })

  // BUG-82: revalidatePath vor dem redirect() ist NOTWENDIG damit der
  // Next.js Router-Cache die alte RSC-Payload fuer den Ziel-Pfad
  // (z.B. /gutachter, das vor dem Login als 'redirect to /login' gecached
  // wurde) verwirft.
  revalidatePath(targetPath, 'layout')
  redirect(targetPath)
}
