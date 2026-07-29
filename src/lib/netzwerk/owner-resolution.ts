// Entity->Profil-Aufloesung fuer die Netzwerk-Bindung (Spec 1 §8, P3-Seed).
//
// deriveVermittler (lib/leads/vermittler.ts) liefert vermittlerTyp/vermittlerId aus
// typspezifischen IDs (werkstaetten.id / firmen_flotten_konten.id) — fuer den Graph-Knoten
// (claims.netzwerk_owner_id) brauchen wir das zugehoerige profiles.id. service_role-Client
// (untyped admin) reicht — nur Identitaets-Spalten.
//
// makler = v1 kein Graph-Knoten -> null (kein Owner). NIE outbound (sv_id/reparatur_werkstatt_id)
// — der Caller uebergibt nur den INBOUND-Vermittler (deriveVermittler-Ergebnis).
//
// Nur die SEED-Seite lebt hier (P3-Suppression-Seite/resolveProvisionPartnerProfil ist
// separater Scope — kommt mit der Provisions-Release-Gate-Arbeit dazu).

import type { SupabaseClient } from '@supabase/supabase-js'

/** werkstaetten.id -> profiles.id (werkstaetten.user_id). */
async function werkstattUserId(admin: SupabaseClient, werkstattId: string): Promise<string | null> {
  const { data } = await admin.from('werkstaetten').select('user_id').eq('id', werkstattId).maybeSingle()
  return (data?.user_id as string | null) ?? null
}

/** firmen_flotten_konten.id (Konto) -> profiles.id (Konto.user_id). */
async function flottenKontoUserId(admin: SupabaseClient, kontoId: string): Promise<string | null> {
  const { data } = await admin.from('firmen_flotten_konten').select('user_id').eq('id', kontoId).maybeSingle()
  return (data?.user_id as string | null) ?? null
}

/**
 * SEED-Seite (P3 T2): der INBOUND-Vermittler eines Claims als Owner-Profil.
 * makler = v1 kein Graph-Knoten -> null. NIE outbound — der Caller uebergibt nur den Vermittler.
 */
export async function resolveVermittlerOwnerProfil(
  admin: SupabaseClient,
  vermittlerTyp: string | null,
  vermittlerId: string | null,
): Promise<string | null> {
  if (!vermittlerTyp || !vermittlerId) return null
  if (vermittlerTyp === 'werkstatt') return werkstattUserId(admin, vermittlerId)
  if (vermittlerTyp === 'firmen_flotte') return flottenKontoUserId(admin, vermittlerId)
  return null // makler (v1 kein Knoten) / unbekannt
}
