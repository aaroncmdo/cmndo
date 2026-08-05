// Auth-Guard fuer Vertriebs-/Staff-Aktionen (admin/dispatch/leadbearbeiter).
// Spiegelt das Verhalten der lokalen requireVertriebStaff in partner-leads/actions.ts,
// als teilbarer Helper fuer neuen Code (Partner-Cockpit). String-Vergleich statt Enum,
// weil der TS-UserRolle-Typ der DB (leadbearbeiter) nachlaeuft.
import { createClient } from '@/lib/supabase/server'

export const VERTRIEB_ROLLEN = ['admin', 'dispatch', 'leadbearbeiter'] as const

export function istVertriebRolle(rolle: string | null | undefined): boolean {
  return VERTRIEB_ROLLEN.includes((rolle ?? '') as (typeof VERTRIEB_ROLLEN)[number])
}

export async function requireVertriebStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  return istVertriebRolle(p?.rolle as string | undefined) ? { id: user.id } : null
}
