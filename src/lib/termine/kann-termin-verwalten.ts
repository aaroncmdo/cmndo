// Geteilter Owner-Guard fuer Kunde-Termin-Aktionen (Verschieben/Absagen).
// Autorisiert Kunde-Owner ODER Flottenmanager, dessen Firma das Claim-Fahrzeug haelt.
// Ein Aufruf liefert die Auth-Entscheidung + die Task-/Timeline-Metadaten (kundenbetreuer,
// claim_nummer), damit der Route-Handler keinen zweiten v_claim_full-Read braucht.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getFlottenmanagerFirma } from '@/lib/flotte/konto-firma'
import { getKundeFlotte } from '@/lib/kunde/firma-flotte'

type User = { id: string; email: string | null }

/** Reiner Kunde-Owner-Check (testbar, kein DB-Zugriff). */
export function istKundeOwner(
  fall: { kunde_id: string | null; lead_email: string | null },
  user: User,
): boolean {
  if (fall.kunde_id && fall.kunde_id === user.id) return true
  if (fall.lead_email && user.email && fall.lead_email.toLowerCase() === user.email.toLowerCase()) return true
  return false
}

export type TerminVerwaltenResult = { ok: boolean; kundenbetreuerId: string | null; claimNummer: string | null }

/** Kunde-Owner ODER Flottenmanager-Firma darf den Fall verwalten. db = Admin/Service-Role. */
export async function kannTerminFallVerwalten(
  admin: SupabaseClient,
  user: User,
  fallId: string,
): Promise<TerminVerwaltenResult> {
  // C5 (Doktrin §5): `vehicle_id` kommt aus DIESEM Read mit — der Flottenmanager-Zweig
  // unten holte es frueher per zweitem Roundtrip auf `claims` fuer denselben Claim.
  const { data: fallRow } = await admin
    .from('v_claim_full')
    .select('id, fall_id, kunde_id, lead_id, kundenbetreuer_id, claim_nummer, vehicle_id')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!fallRow) return { ok: false, kundenbetreuerId: null, claimNummer: null }
  const kundenbetreuerId = (fallRow.kundenbetreuer_id as string | null) ?? null
  const claimNummer = (fallRow.claim_nummer as string | null) ?? null

  // 1) Kunde-Owner (kunde_id ODER Lead-Email).
  let leadEmail: string | null = null
  if (fallRow.lead_id) {
    const { data: lead } = await admin.from('leads').select('email').eq('id', fallRow.lead_id as string).maybeSingle()
    leadEmail = (lead?.email as string | null) ?? null
  }
  if (istKundeOwner({ kunde_id: fallRow.kunde_id as string | null, lead_email: leadEmail }, user)) {
    return { ok: true, kundenbetreuerId, claimNummer }
  }

  // 2) Flottenmanager: Firma des Users haelt das Fahrzeug dieses Claims?
  const firma = await getFlottenmanagerFirma(admin, user.id)
  if (!firma) return { ok: false, kundenbetreuerId, claimNummer }
  const vehicleId = (fallRow.vehicle_id as string | null) ?? null
  if (!vehicleId) return { ok: false, kundenbetreuerId, claimNummer }
  const flotte = await getKundeFlotte(admin, firma.id)
  return { ok: flotte.some((v) => v.vehicleId === vehicleId), kundenbetreuerId, claimNummer }
}
