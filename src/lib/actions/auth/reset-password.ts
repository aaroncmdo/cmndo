'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { pruefePasswortStaerke } from '@/lib/auth/password-policy'
import { roleToPath } from '@/lib/auth/role-redirect'

/**
 * BUG-84: Passwort-Reset Backend.
 *
 * Schickt einen Reset-Link an die angegebene Email. Returnt aus
 * Sicherheits-Gründen IMMER `success: true` (Email-Enumeration-Schutz —
 * der Caller darf nicht erfahren, ob die Email überhaupt einen Account
 * hat).
 *
 * Der redirectTo-Pfad muss in der Supabase-Dashboard-Konfiguration unter
 * "Auth → URL Configuration → Redirect URLs" freigegeben sein, sonst lehnt
 * Supabase den Link ab.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ success: true }> {
  const trimmed = (email ?? '').trim().toLowerCase()
  if (!trimmed) return { success: true }

  const supabase = await createClient()

  // Origin aus Request-Headern bauen, damit lokale Dev-Sessions den
  // localhost-Link bekommen und Production den app.claimondo.de-Link.
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'app.claimondo.de'
  const origin = `${proto}://${host}`

  try {
    await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${origin}/passwort-zuruecksetzen`,
    })
  } catch (err) {
    // Auch bei Fehlern silent success — wir wollen keine Information
    // darüber leaken, ob der Account existiert. Trotzdem in Server-Log
    // schreiben, falls Aaron im Dashboard nachschauen will.
    console.error('[requestPasswordReset] Supabase-Fehler:', err)
  }

  return { success: true }
}

/**
 * Setzt das neue Passwort, nachdem der User dem Email-Link gefolgt ist und
 * Supabase via Recovery-Token bereits eine Session etabliert hat. Räumt
 * außerdem das `force_password_change`-Flag im Profil auf, damit der
 * normale Login-Flow danach nicht erneut auf /passwort-aendern umleitet.
 */
export async function confirmPasswordReset(
  neuesPasswort: string,
  recoverySession?: { access_token: string; refresh_token: string },
): Promise<{ success: boolean; error?: string; redirectTo?: string }> {
  // AAR-auth-haertung (Befund J): zentrale Policy — >=12 Zeichen + HIBP-Breach-
  // Check (k-anonymity, fail-open). Loest die fruehere >=8-Inline-Pruefung ab.
  const policy = await pruefePasswortStaerke(neuesPasswort)
  if (!policy.ok) {
    return { success: false, error: policy.error }
  }

  const supabase = await createClient()

  // Welcome-Magic-Links (Werkstatt/SV) nutzen admin.generateLink({ type: 'recovery' }) → eine
  // IMPLICIT-Session im URL-Hash (#access_token). Der Browser-Client haelt sie nur in-memory und
  // schreibt KEIN Cookie; die Page reicht deshalb die Recovery-Tokens durch und wir etablieren
  // die Session hier serverseitig. Ohne das findet getUser() keine Session → der Reset schlaegt
  // bei JEDEM Welcome-Magic-Link STILL fehl (Passwort wird nie gesetzt, Login unmoeglich).
  // Passwort-vergessen nutzt PKCE ?code (Cookie ist bereits gesetzt) → recoverySession dort
  // redundant, aber harmlos. Die Tokens stammen aus der geschuetzten Recovery-Session (per
  // Magic-Link), setSession validiert sie serverseitig — kein zusaetzlicher Angriffsvektor.
  if (recoverySession?.access_token && recoverySession?.refresh_token) {
    await supabase.auth.setSession({
      access_token: recoverySession.access_token,
      refresh_token: recoverySession.refresh_token,
    })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return {
      success: false,
      error: 'Reset-Link ist abgelaufen oder ungültig. Bitte fordere einen neuen Link an.',
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: neuesPasswort,
  })
  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Onboarding (frisch angelegter Account, force_password_change war true) vs.
  // Passwort-vergessen unterscheiden — BEVOR wir das Flag räumen. Rolle gleich fuer
  // das Portal-Redirect mitlesen (eigene Row, RLS erlaubt Self-Read via Recovery-Session).
  const { data: profil } = await supabase
    .from('profiles')
    .select('rolle, force_password_change')
    .eq('id', user.id)
    .single()
  const warOnboarding = profil?.force_password_change === true

  // force_password_change zurücksetzen — der User hat aktiv ein neues Passwort
  // gewählt. GARANTIERT via Service-Role + Fehler-Check (analog setzeNeuesPasswort):
  // bleibt das Flag still true, landet der User beim naechsten Login erneut auf
  // /passwort-aendern (stiller Loop-Trap).
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { error: flagError } = await createAdminClient()
    .from('profiles')
    .update({ force_password_change: false })
    .eq('id', user.id)
  if (flagError) {
    return {
      success: false,
      error: 'Passwort wurde gesetzt, aber das Profil konnte nicht aktualisiert werden. Bitte erneut einloggen.',
    }
  }

  // Onboarding: der User bleibt in der Recovery-Session eingeloggt und wird direkt in
  // sein Portal geschickt — konsistent mit dem Einmalpasswort-Login (/passwort-aendern),
  // damit der Magic-Link-Button "Passwort setzen & einloggen" sein Versprechen haelt.
  // Passwort-vergessen (Flag war schon false): unveraendert -> Page loggt aus -> /login.
  if (warOnboarding) {
    return { success: true, redirectTo: roleToPath(profil?.rolle as string | null | undefined) }
  }
  return { success: true }
}
