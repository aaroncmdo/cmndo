// Kunde-Fahrzeug-Schadenhistorie (P6 / WS H): Claims + Draft-Leads eines Fahrzeugs,
// owner-scoped (vehicles.current_owner_id) — das Kunde-Pendant zum firma-scoped
// getFahrzeugSchaeden. Der Kern (Claims-/Drafts-Queries) ist geteilt:
// ladeSchaedenFuerFahrzeug aus src/lib/flotte/fahrzeug-schaeden.ts.
// Pure loader — kein throw, Gate-Miss/Fehler -> leere Arrays (kein Leak fremder Daten).

import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeSchaedenFuerFahrzeug, type FahrzeugSchaeden } from '@/lib/flotte/fahrzeug-schaeden'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = SupabaseClient<any, any, any>

export async function getKundeFahrzeugSchaeden(
  db: AnyDb,
  userId: string,
  vehicleId: string,
): Promise<FahrzeugSchaeden> {
  // Owner-Gate: Fahrzeug muss dem Kunden gehoeren (K8-Achse, nicht Flotten-Achse).
  const { data: owned } = await db
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('current_owner_id', userId)
    .maybeSingle()

  if (!owned) {
    return { claims: [], drafts: [] }
  }

  return ladeSchaedenFuerFahrzeug(db, vehicleId)
}
