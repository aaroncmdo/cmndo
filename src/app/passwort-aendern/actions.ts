'use server'

import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { pruefePasswortStaerke } from '@/lib/auth/password-policy'
import { istUnbekannterPasswortFehler, uebersetzePasswortFehler } from '@/lib/auth/passwort-fehler'

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

export async function setzeNeuesPasswort(
  neuesPasswort: string,
  recoverySession?: { access_token: string; refresh_token: string },
): Promise<{ ok: true; redirectTo: string } | { ok: false; error: string }> {
  // Staerke-Pruefung (>= 12 Zeichen + HIBP-Breach-Check) an die zentrale Policy
  // delegiert — identisch zu confirmPasswordReset (reset-password.ts). Die
  // Policy deckt leere/zu-kurze Eingaben selbst ab (guard vor dem HIBP-Fetch).
  const policy = await pruefePasswortStaerke(neuesPasswort)
  if (!policy.ok) {
    return { ok: false, error: policy.error }
  }

  const supabase = await createClient()

  // Recovery-/Welcome-Magic-Links (admin.generateLink type=recovery) etablieren die Session als
  // IMPLICIT-Hash (#access_token) OHNE Cookie; der Browser-Client haelt sie nur in-memory und die
  // Page reicht die Tokens durch. Ohne das serverseitige setSession sieht getUser() bei einem
  // solchen Link KEINE Session -> der Passwort-Reset schlaegt STILL fehl (force_password_change
  // bleibt true, Login-Sackgasse; prod-Incident 21.07. Werkstatt-Onboarding). Der normale
  // Einmalpasswort-Login (Cookie via /api/auth/login-after-flow) uebergibt keine recoverySession
  // -> harmlos/redundant. Identisches Muster wie confirmPasswordReset (reset-password.ts).
  if (recoverySession?.access_token && recoverySession?.refresh_token) {
    await supabase.auth.setSession({
      access_token: recoverySession.access_token,
      refresh_token: recoverySession.refresh_token,
    })
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { ok: false, error: 'Nicht angemeldet. Bitte erneut einloggen.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: neuesPasswort })
  if (updateError) {
    // ⚠ Supabase antwortet auf ENGLISCH und prueft zusaetzlich SELBST gegen
    // Have-I-Been-Pwned (password_hibp_enabled=true) — anders als unsere Policy
    // oben aber fail-CLOSED. Faellt HIBP kurz aus, laesst unsere Pruefung durch
    // und Supabase lehnt ab; der Nutzer sah bis 24.08. die rohe englische
    // Meldung und blieb mit force_password_change=true haengen (Prod-Vorfall
    // 23.08., frisch registrierter Sachverstaendiger).
    if (istUnbekannterPasswortFehler(updateError.message)) {
      console.error('[passwort-aendern] unbekannter Supabase-Fehler:', updateError.message)
    }
    return { ok: false, error: uebersetzePasswortFehler(updateError.message) }
  }

  // force_password_change zuruecksetzen — GARANTIERT via Service-Role (nicht dem
  // User-RLS-Client) + Row-Count-Check. Schlaegt der Clear still fehl (RLS-Aenderung,
  // Session-Edge, 0-Row-Match) und bleibt das Flag true, landet der User beim
  // naechsten Login erneut auf /passwort-aendern (stiller Loop-Trap — genau das,
  // was einen frisch angelegten SV aussperrt). Service-Role (eigene Row, kein RLS)
  // + .select()-Row-Count schliessen die Falle aus.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data: flagRows, error: flagError } = await createAdminClient()
    .from('profiles')
    .update({ force_password_change: false })
    .eq('id', user.id)
    .select('id')
  if (flagError || !flagRows || flagRows.length === 0) {
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
