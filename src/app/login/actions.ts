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

  if (!email || !password) {
    redirect('/login?error=E-Mail+und+Passwort+sind+erforderlich')
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    redirect(`/login?error=${encodeURIComponent(signInError.message)}`)
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect(`/login?error=${encodeURIComponent(userError?.message ?? 'Kein Benutzer gefunden')}`)
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('rolle, force_password_change, auth_provider')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Profile query failed:', profileError.message, '| User:', user.id)
    redirect(`/login?error=${encodeURIComponent('Profil konnte nicht geladen werden: ' + profileError.message)}`)
  }

  if (!profile?.rolle) {
    redirect('/login?error=Keine+Rolle+im+Profil+hinterlegt')
  }

  // Check if password change is required (only for email auth)
  const authProvider = profile.auth_provider ?? 'email'
  if (profile.force_password_change && authProvider === 'email') {
    // BUG-82: Vor dem Redirect den gesamten App-Cache invalidieren — sonst
    // serviert der Next.js Router-Cache die alte (logged-out) RSC-Payload
    // fuer den Ziel-Pfad und der User landet auf einem White-Screen, der
    // nur per Hard-Reload wieder zum Leben kommt.
    revalidatePath('/', 'layout')
    redirect('/passwort-aendern')
  }

  // BUG-82: revalidatePath('/', 'layout') vor dem redirect() ist NOTWENDIG
  // damit der Next.js Router-Cache die alte RSC-Payload fuer den Ziel-Pfad
  // (z.B. /gutachter, das vor dem Login als 'redirect to /login' gecached
  // wurde) verwirft. Ohne diesen Aufruf rendert /gutachter direkt nach
  // dem Login einen White-Screen und nur ein Hard-Reload behebt es.
  // Root Cause: Server Actions revalidieren nur den AKTUELLEN Pfad, nicht
  // den Ziel-Pfad eines redirect(). Bekanntes App-Router Verhalten.
  revalidatePath('/', 'layout')
  redirect(roleToPath(profile.rolle))
}
