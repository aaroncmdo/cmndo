'use server'

// BUG-83 Befund 6: Zentraler Logout-Helper.
// Wird sowohl von der API-Route /api/auth/logout (Admin + Mitarbeiter via
// <form action=...>) als auch vom Gutachter-Portal (client-side
// signOut + window.location) konsumiert.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-Side Logout: meldet den User via Supabase ab und gibt die
 * Ziel-URL zurueck. Caller (API-Route oder Server Action) ist fuer den
 * tatsaechlichen Redirect zustaendig.
 *
 * Alle Pfade landen auf '/login' — wir hatten frueher keinen
 * '/admin/login' Pfad, was den Admin-Logout in eine 404 laufen liess.
 *
 * BUG-82: Wir invalidieren zusätzlich den gesamten App-Layout-Cache, damit
 * ein nachfolgender Login nicht eine stale RSC-Payload fuer /gutachter
 * (oder /admin) bekommt — sonst entsteht der White-Screen-Bug.
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
  try {
    revalidatePath('/', 'layout')
  } catch {
    // revalidatePath funktioniert nur in Server-Action / Route-Handler-
    // Kontexten. Sollten wir hier in einem unerwarteten Kontext laufen,
    // ist das Schlimmste was passieren kann ein stale Cache — kein Crash.
  }
  return { redirectTo: '/login' }
}
