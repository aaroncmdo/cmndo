// Entity->Profil-Aufloesung fuer die Netzwerk-Bindung (Spec 1 §8, P3-Seed) und die
// Provisions-Suppression (§13b).
//
// Zwei Resolver, weil der Flotten-Lookup-Key differiert:
//   - Seed:        deriveVermittler.vermittlerId = firmen_flotten_konten.id (Konto)
//   - Suppression: partner_provisionen.partner_id = FIRMA_id (im create_firmen_flotte_provision-
//                  Trigger aus dem Fahrzeug aufgeloest — verifiziert 28.07. via pg_get_functiondef)
// service_role-Client (untyped admin) reicht — nur Identitaets-Spalten.
//
// makler = v1 kein Graph-Knoten -> null (kein Owner). NIE outbound (sv_id/reparatur_werkstatt_id)
// — der Seed-Caller uebergibt nur den INBOUND-Vermittler (deriveVermittler-Ergebnis).

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

/** firma_id -> profiles.id (aktives firmen_flotten_konten.user_id). Spiegelt den Trigger-Join. */
async function flottenKontoUserIdByFirmaId(admin: SupabaseClient, firmaId: string): Promise<string | null> {
  const { data } = await admin
    .from('firmen_flotten_konten')
    .select('user_id')
    .eq('firma_id', firmaId)
    .eq('status', 'aktiv')
    .limit(1)
    .maybeSingle()
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

/** Externe Provisions-Typen: kein Graph-Knoten v1 -> nie unterdrueckt. */
export const EXTERNE_PARTNER_TYPEN: ReadonlySet<string> = new Set(['makler', 'makler_empfehlung'])

/**
 * SUPPRESSION-Seite (P3 T4): der Inbound-Partner einer partner_provisionen-Row als Owner-Profil.
 * partner_id: werkstatt=werkstaetten.id, firmen_flotte=FIRMA_id (Trigger-Realitaet).
 * makler/makler_empfehlung = extern -> null. Unaufloesbar -> null (= Status quo, freigeben).
 */
export async function resolveProvisionPartnerProfil(
  admin: SupabaseClient,
  partnerTyp: string,
  partnerId: string,
): Promise<string | null> {
  if (EXTERNE_PARTNER_TYPEN.has(partnerTyp)) return null
  if (partnerTyp === 'werkstatt') return werkstattUserId(admin, partnerId)
  if (partnerTyp === 'firmen_flotte') return flottenKontoUserIdByFirmaId(admin, partnerId)
  return null
}
