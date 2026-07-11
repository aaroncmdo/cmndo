'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { resolveSchadenkarteToFahrzeug } from '@/lib/schadenkarte/schadenkarte'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('@supabase/supabase-js').SupabaseClient<any, any, any>

/**
 * Reverse-Lookup: Welches Fahrzeug gehört zu diesem Karten-Token?
 * Firma-scoped — gibt nur Treffer zurück wenn die Karte zur eigenen Firma gehört.
 */
export async function identifiziereKarte(
  token: string,
): Promise<{ ok: true; vehicleId: string } | { ok: false; error: string }> {
  const { user } = await requirePortalAccess(['flottenmanager'])
  const db = createAdminClient() as AnyDb
  const firma = await getFlottenmanagerFirma(db, user.id)
  if (!firma) return { ok: false, error: 'Kein Flotten-Konto gefunden.' }

  const karte = await resolveSchadenkarteToFahrzeug(db, token)
  if (!karte) return { ok: false, error: 'Karte nicht gefunden.' }

  if (karte.firmaId !== firma.id) {
    return { ok: false, error: 'Karte gehört zu keinem Ihrer Fahrzeuge.' }
  }

  if (!karte.fahrzeugId) {
    return { ok: false, error: 'Karte ist noch keinem Fahrzeug zugewiesen.' }
  }

  return { ok: true, vehicleId: karte.fahrzeugId }
}
