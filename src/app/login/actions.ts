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
  cookieStore.set(REMEMBER_COOKIE_NAME, remember ? '1' : '0', {
    path: '/',
    sameSite: 'lax',
    // Marker-Cookie selbst lebt 1 Jahr — wir muessen wissen, was der User
    // gewaehlt hat, auch wenn die Auth-Cookies Session-Cookies sind.
    // (Bei Logout wird er via supabase signOut nicht entfernt; das ist OK,
    // er hat ohne Auth-Cookies keine Wirkung.)
    maxAge: ONE_YEAR_SECONDS,
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

  // AAR-562: Wenn der User kein 2FA aktiviert hat, setzen wir das
  // claimondo_2fa_verified-Cookie hier direkt (Server Action darf Cookies
  // schreiben, /login/2fa-Page als Server Component in Next.js 16 nicht
  // zuverlässig). Ohne diesen Cookie redirected die Middleware jede
  // /admin/*-Navigation zurück auf /login/2fa → /-Loop.
  // Google-OAuth-User durchlaufen diesen Flow nicht — für sie wird das
  // Cookie beim OAuth-Callback gesetzt (bzw. der 2FA-Flow übersprungen).
  const zweiFaInaktiv =
    profile.twofa_aktiviert === false && profile.twofa_email_aktiviert === false
  if (zweiFaInaktiv) {
    cookieStore.set('claimondo_2fa_verified', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3 * 24 * 60 * 60,
    })
  }

  // BUG-82: revalidatePath vor dem redirect() ist NOTWENDIG damit der
  // Next.js Router-Cache die alte RSC-Payload fuer den Ziel-Pfad
  // (z.B. /gutachter, das vor dem Login als 'redirect to /login' gecached
  // wurde) verwirft. Ohne diesen Aufruf rendert der Target direkt nach
  // dem Login einen White-Screen und nur ein Hard-Reload behebt es.
  //
  // AAR-621: Scope von `'/'` + `'layout'` auf den konkreten Target-Pfad
  // reduziert. Vorher invalidierte der Call den KOMPLETTEN App-Tree
  // (jeder Layout-Cache, jeder Route-Segment-Cache) — bei 25+ Routes auf
  // Nano-Tier ein merklicher Fixed-Cost pro Login. Jetzt nur der Pfad
  // den der User tatsächlich sieht. Andere Routes werden bei ihrer ersten
  // Navigation ohnehin frisch geladen.
  revalidatePath(targetPath, 'layout')
  redirect(targetPath)
}
