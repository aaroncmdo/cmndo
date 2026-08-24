'use server'

import { createClient } from '@/lib/supabase/server'
import { pruefePasswortStaerke } from '@/lib/auth/password-policy'
import { istUnbekannterPasswortFehler, uebersetzePasswortFehler } from '@/lib/auth/passwort-fehler'
import { roleToPath } from '@/lib/auth/role-redirect'
import { buildWelcomeConfirmLink } from '@/lib/auth/welcome-link'

// NICHT exportieren — aus 'use server'-Files exportierte Konstanten werden im
// Client-Bundle zu undefined (AGENTS.md, AAR-664).
const MAX_RESET_MAILS_PRO_STUNDE = 3

/**
 * BUG-84: Passwort-Reset Backend.
 *
 * Schickt einen Reset-Link an die angegebene Email. Returnt aus
 * Sicherheits-Gründen IMMER `success: true` (Email-Enumeration-Schutz —
 * der Caller darf nicht erfahren, ob die Email überhaupt einen Account hat).
 *
 * VERSAND ÜBER DIE APP-PIPELINE (Resend/SMTP + branded react-email-Template),
 * nicht mehr über `supabase.auth.resetPasswordForEmail`. Grund (13.07.2026,
 * evidenzbasiert): resetPasswordForEmail geht über Supabases Built-in-Mailer
 * (noreply@mail.app.supabase.io) — generisches Template, projektweites Rate-Limit
 * (~2-4 Mails/h) und schlechte Zustellbarkeit bei Firmen-Domains. Reset-Mails kamen
 * schlicht nicht an; der User sah nur den alten, laengst abgelaufenen Link.
 *
 * Der Link kommt aus dem geteilten `buildWelcomeConfirmLink`-Helper (wie alle
 * Welcome-Magic-Links): generateLink({type:'recovery'}) -> hashed_token ->
 * /api/auth/confirm, das verifyOtp SERVERSEITIG aufruft und die Session als
 * COOKIE etabliert. Dadurch funktioniert der Reset auch geraeteuebergreifend
 * (kein PKCE-code_verifier im Browser noetig) und /passwort-zuruecksetzen findet
 * die Session direkt.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ success: true }> {
  const trimmed = (email ?? '').trim().toLowerCase()
  if (!trimmed) return { success: true }

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    // ANTI-BOMBING: Supabases Built-in-Mailer hatte ein (grobes) projektweites Rate-Limit,
    // das mit dem Wechsel auf die App-Pipeline wegfaellt. /passwort-vergessen ist oeffentlich
    // + unauthentifiziert -> ohne Drossel koennte jemand ein fremdes Postfach zumuellen.
    // Deshalb explizit: max. MAX_RESET_MAILS_PRO_STUNDE pro Empfaenger.
    // FAIL-OPEN: ein DB-Hiccup im Check darf einen legitimen Reset niemals blockieren.
    let gedrosselt = false
    try {
      const seit = new Date(Date.now() - 60 * 60_000).toISOString()
      const { count } = await admin
        .from('email_log')
        .select('id', { count: 'exact', head: true })
        .eq('template', 'passwort_reset')
        .eq('empfaenger', trimmed)
        .gte('created_at', seit)
      gedrosselt = (count ?? 0) >= MAX_RESET_MAILS_PRO_STUNDE
    } catch (err) {
      console.error('[requestPasswordReset] Rate-Limit-Check fehlgeschlagen (fail-open):', err)
    }
    if (gedrosselt) {
      // Nach aussen ununterscheidbar von einem Versand (Enumeration-/Abuse-Schutz).
      console.warn('[requestPasswordReset] Rate-Limit erreicht — kein weiterer Versand')
      return { success: true }
    }

    // Unbekannte Email -> generateLink schlaegt fehl -> null -> wir senden nichts,
    // returnen aber trotzdem success (Enumeration-Schutz bleibt gewahrt).
    const actionUrl = await buildWelcomeConfirmLink(trimmed, 'recovery', '/passwort-zuruecksetzen')
    if (actionUrl) {
      // Vorname nur fuer die Anrede (best-effort). Das Ergebnis verlaesst die
      // Funktion nie -> kein Existenz-Leak an den Caller.
      const { data: profil } = await admin
        .from('profiles')
        .select('vorname')
        .eq('email', trimmed)
        .maybeSingle()

      const { sendPasswortReset } = await import('@/lib/email/google/flows')
      const res = await sendPasswortReset({
        to: trimmed,
        vorname: (profil?.vorname as string | null) ?? null,
        actionUrl,
      })
      if (!res.success) {
        console.error('[requestPasswordReset] Mail-Versand fehlgeschlagen:', res.error)
      }
    }
  } catch (err) {
    // Silent success — keine Information darueber leaken, ob der Account existiert.
    console.error('[requestPasswordReset] Fehler:', err)
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
    // Dieselbe Falle wie in /passwort-aendern: Supabase antwortet englisch und
    // prueft selbst gegen HIBP (fail-closed), waehrend unsere Policy fail-open ist.
    if (istUnbekannterPasswortFehler(updateError.message)) {
      console.error('[reset-password] unbekannter Supabase-Fehler:', updateError.message)
    }
    return { success: false, error: uebersetzePasswortFehler(updateError.message) }
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
