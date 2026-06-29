'use server'

import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'

// AAR-auth-haertung: Passwort-Wechsel als Server-Action.
//
// Vorher lief der Passwort-Update auf dem BROWSER-Client (createClient aus
// @/lib/supabase/client) direkt in der Page. Nach dem Login-Redirect auf
// /passwort-aendern hatte der Browser-Client die frisch gesetzten Auth-Cookies
// aber noch nicht zuverlaessig gelesen (Cookie-Propagation-Race — NICHT
// httpOnly; @supabase/ssr setzt die Auth-Cookies httpOnly:false) -> der erste
// updateUser() warf "Auth session missing" und der First-Login fuer Staff mit
// Einmalpasswort war blockiert.
//
// Serverseitig liest createClient (@/lib/supabase/server) die Cookie-Session
// deterministisch. Gleiches Muster wie confirmPasswordReset (reset-password.ts)
// und die CMM-14-Loesung in login-after-flow.

const MIN_PASSWORT_LAENGE = 8

export async function setzeNeuesPasswort(
  neuesPasswort: string,
): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  if (!neuesPasswort || neuesPasswort.length < MIN_PASSWORT_LAENGE) {
    return {
      ok: false,
      error: `Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { ok: false, error: 'Nicht angemeldet. Bitte erneut einloggen.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: neuesPasswort })
  if (updateError) {
    return { ok: false, error: updateError.message }
  }

  // force_password_change zuruecksetzen — der Fehler MUSS geprueft werden.
  // Schlaegt der Write fehl (z.B. RLS) und bleibt das Flag true, landet der
  // User beim naechsten Login erneut auf /passwort-aendern (stiller Loop).
  const { error: flagError } = await supabase
    .from('profiles')
    .update({ force_password_change: false })
    .eq('id', user.id)
  if (flagError) {
    return {
      ok: false,
      error:
        'Passwort wurde gesetzt, aber das Profil konnte nicht aktualisiert werden. Bitte erneut einloggen.',
    }
  }

  // Rolle fuer das Redirect-Ziel lesen. Der Client navigiert per Hard-Redirect
  // (window.location) — das vermeidet die RSC-Soft-Nav-Race mit den frisch
  // rotierten Auth-Cookies (CMM-14-Lehre), darum kein redirect()/revalidatePath
  // hier.
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()

  return { ok: true, redirectTo: roleToPath(profile?.rolle as string | null | undefined) }
}
