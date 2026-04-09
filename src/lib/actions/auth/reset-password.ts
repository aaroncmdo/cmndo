'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

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
  // localhost-Link bekommen und Production den cmndo.vercel.app-Link.
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'cmndo.vercel.app'
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
): Promise<{ success: boolean; error?: string }> {
  if (!neuesPasswort || neuesPasswort.length < 8) {
    return { success: false, error: 'Passwort muss mindestens 8 Zeichen lang sein.' }
  }

  const supabase = await createClient()

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

  // force_password_change zurücksetzen — der User hat aktiv ein neues
  // Passwort gewählt, also gilt das nicht mehr als "Initial-Passwort".
  await supabase
    .from('profiles')
    .update({ force_password_change: false })
    .eq('id', user.id)

  return { success: true }
}
