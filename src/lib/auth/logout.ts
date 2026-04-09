// BUG-83 Befund 6: Zentraler Logout-Helper.
// Wird sowohl von der API-Route /api/auth/logout (Admin + Mitarbeiter via
// <form action=...>) als auch vom Gutachter-Portal (client-side
// signOut + window.location) konsumiert.

import { createClient } from '@/lib/supabase/server'

/**
 * Server-Side Logout: meldet den User via Supabase ab und gibt die
 * Ziel-URL zurueck. Caller (API-Route oder Server Action) ist fuer den
 * tatsaechlichen Redirect zustaendig.
 *
 * Alle Pfade landen auf '/login' — wir hatten frueher keinen
 * '/admin/login' Pfad, was den Admin-Logout in eine 404 laufen liess.
 */
export async function serverSignOut(): Promise<{ redirectTo: string }> {
  const supabase = await createClient()
  try {
    await supabase.auth.signOut()
  } catch {
    // Selbst wenn signOut intern crasht (z.B. korrupte Cookies), wollen wir
    // den User trotzdem auf /login schicken — der Cookie wird dann beim
    // naechsten Request neu gesetzt.
  }
  return { redirectTo: '/login' }
}
