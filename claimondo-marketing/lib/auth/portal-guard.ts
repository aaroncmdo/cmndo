// K5-Konsolidierung (pragmatisch): Portal-Layout-Auth-Guard.
//
// Statt der oft wiederholten 15-20 Zeilen am Anfang jedes Portal-Layouts
// (getUser + redirect-to-login + profile-select + role-check + redirect-to-
// other-portal) gibt es hier einen einzigen Helper. Der Render-Teil der
// Shells (Sidebar, Header, Branding) bleibt Portal-spezifisch — dort
// divergieren die Portale zu stark für ein gemeinsames Shell-Component.
//
// Rückgabe enthält alles was ein Layout typischerweise braucht:
//   - supabase-Client (nicht erneut createClient nötig)
//   - user (auth.user)
//   - profile (rolle, vorname, nachname)
//   - displayName (bereits formatiert)
//   - initials (bereits formatiert)
//
// Bei fehlendem Login → redirect('/login') (hartes throw via next/navigation).
// Bei falscher Rolle → redirect(roleToPath(...)) — keine 403-Seite, user
// landet im eigenen Portal.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { roleToPath } from '@/lib/auth/role-redirect'
import type { UserRolle } from './guards'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Client = SupabaseClient<Database>

export type PortalGuardResult = {
  supabase: Client
  user: { id: string; email: string | null }
  profile: {
    rolle: UserRolle
    vorname: string | null
    nachname: string | null
  }
  displayName: string
  initials: string
}

/**
 * Auth + Rollen-Guard für Portal-Layouts. Wirft via redirect() — die
 * zurückgegebene Promise löst nur aus wenn der User berechtigt ist.
 *
 * @param allowedRollen Rollen die dieses Portal betreten dürfen. Admin
 *   wird NICHT automatisch hinzugefügt — Caller muss 'admin' explizit
 *   reinschreiben wenn Admin das Portal im Testing-Modus sehen darf.
 */
export async function requirePortalAccess(
  allowedRollen: UserRolle[],
): Promise<PortalGuardResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('rolle, vorname, nachname')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[portal-guard] profile query failed:', error.message)
    redirect('/login?error=Profil+nicht+ladbar')
  }
  if (!profile) {
    redirect('/login?error=Kein+Profil')
  }

  const rolle = profile.rolle as UserRolle
  if (!allowedRollen.includes(rolle)) {
    redirect(roleToPath(rolle))
  }

  const displayName =
    [profile.vorname, profile.nachname].filter(Boolean).join(' ') || user.email || ''
  const initials =
    [profile.vorname?.[0], profile.nachname?.[0]].filter(Boolean).join('').toUpperCase() ||
    user.email?.substring(0, 2).toUpperCase() ||
    'U'

  return {
    supabase,
    user: { id: user.id, email: user.email ?? null },
    profile: {
      rolle,
      vorname: profile.vorname ?? null,
      nachname: profile.nachname ?? null,
    },
    displayName,
    initials,
  }
}
