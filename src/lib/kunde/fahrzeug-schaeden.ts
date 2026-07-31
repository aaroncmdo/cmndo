// Kunde-Fahrzeug-Schadenhistorie (P6 / WS H): Claims + Draft-Leads eines Fahrzeugs,
// owner-scoped (vehicles.current_owner_id) — das Kunde-Pendant zum firma-scoped
// getFahrzeugSchaeden. Der Kern (Claims-/Drafts-Queries) ist geteilt:
// ladeSchaedenFuerFahrzeug aus src/lib/flotte/fahrzeug-schaeden.ts.
//
// ZWEITES Gate (Review-Fix, Cross-Owner-Leak): ein vehicle kann Claims MEHRERER
// Owner tragen (merge_stub_vehicle haengt alle Stub-Claims um; Backfill bindet den
// Owner des juengsten Claims). Das Fahrzeug-Gate allein wuerde dann fremde
// claim_nummer/schadentag/schadens_hoehe_netto listen. Darum wird das Kern-Ergebnis
// auf die Owner-eigenen IDs partitioniert: Claims via v_claim_full
// (geschaedigter_user_id ODER kunde_id — deckt CMM-19 + Alt-Faelle), Drafts via
// leads.kunde_id. FAIL-CLOSED: Fehler der Filter-Queries -> leere Liste (kein Leak).
//
// Pure loader — kein throw, Gate-Miss/Fehler -> leere Arrays.

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

  const [kern, allowedClaimsRes, allowedLeadsRes] = await Promise.all([
    ladeSchaedenFuerFahrzeug(db, vehicleId),
    db
      .from('v_claim_full')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .or(`geschaedigter_user_id.eq.${userId},kunde_id.eq.${userId}`),
    db.from('leads').select('id').eq('vehicle_id', vehicleId).eq('kunde_id', userId),
  ])

  // Fail-closed: liefert eine Filter-Query einen Fehler, bleibt die jeweilige Liste leer.
  if (allowedClaimsRes.error) {
    console.error('[kunde-fahrzeug-schaeden] claim-owner filter error:', allowedClaimsRes.error.message)
  }
  if (allowedLeadsRes.error) {
    console.error('[kunde-fahrzeug-schaeden] lead-owner filter error:', allowedLeadsRes.error.message)
  }
  const claimOk = new Set(
    ((allowedClaimsRes.error ? [] : (allowedClaimsRes.data ?? [])) as Array<{ id: string }>).map((r) => r.id),
  )
  const leadOk = new Set(
    ((allowedLeadsRes.error ? [] : (allowedLeadsRes.data ?? [])) as Array<{ id: string }>).map((r) => r.id),
  )

  return {
    claims: kern.claims.filter((c) => claimOk.has(c.claimId)),
    drafts: kern.drafts.filter((d) => leadOk.has(d.leadId)),
  }
}
