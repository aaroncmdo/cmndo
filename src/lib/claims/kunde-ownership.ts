// CMM-29 (Phase 1b): Zentraler Ownership-Check für Kunde-Server-Actions.
//
// Vorher hatte jede Action ihren eigenen Two-Liner:
//   const { data: fall } = await supabase.from('faelle').select('id, kunde_id').eq('id', fallId).single()
//   if (!fall || fall.kunde_id !== user.id) throw new Error('Nicht autorisiert')
//
// Damit war RLS de facto über den Kunde-Login gesichert, aber:
//   • Lead-Email-Fallback (Kunde frisch konvertiert, kunde_id noch null) brach
//   • claim_parties.user_id wurde gar nicht berücksichtigt (Phase 1+ Pflicht)
//
// Dieser Helper macht den drei-stufigen Check parallel zu getKundeFaelle:
//   1. claim_parties.user_id = userId AND rolle = 'geschaedigter'
//   2. faelle.kunde_id = userId
//   3. leads.email = email AND lead → fall
//
// Caller bekommt einen typed Result zurück; bei Erfolg ist die fall-Row
// inklusive Lifecycle-Felder gleich mit dabei (spart einen zweiten Read).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

export type KundeOwnershipResult =
  | {
      ok: true
      fallId: string
      claimId: string | null
      kundeId: string | null
      leadId: string | null
      kundenbetreuerId: string | null
      svId: string | null
    }
  | { ok: false; error: 'not_found' | 'not_authorized' }

/**
 * Prüft, ob der eingeloggte Kunde-User Eigentümer dieses Falls ist.
 *
 * `admin` muss ein Service-Role-Client sein (RLS-Bypass) — die drei
 * Ownership-Pfade müssen quer über mehrere RLS-geschützte Tabellen gucken,
 * was mit dem User-Client nicht zuverlässig geht.
 */
export async function assertKundeOwnsFall(
  admin: DbClient,
  userId: string,
  email: string | null,
  fallId: string,
): Promise<KundeOwnershipResult> {
  // 1. Fall + Lifecycle-FKs laden
  const { data: fall } = await admin
    .from('faelle')
    .select('id, claim_id, kunde_id, lead_id, kundenbetreuer_id, sv_id')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'not_found' }

  const fallRow = fall as {
    id: string
    claim_id: string | null
    kunde_id: string | null
    lead_id: string | null
    kundenbetreuer_id: string | null
    sv_id: string | null
  }

  // 2a) faelle.kunde_id direkter Match
  if (fallRow.kunde_id === userId) {
    return {
      ok: true,
      fallId: fallRow.id,
      claimId: fallRow.claim_id,
      kundeId: fallRow.kunde_id,
      leadId: fallRow.lead_id,
      kundenbetreuerId: fallRow.kundenbetreuer_id,
      svId: fallRow.sv_id,
    }
  }

  // 2b) claim_parties.user_id (Geschädigter)
  if (fallRow.claim_id) {
    const { data: party } = await admin
      .from('claim_parties')
      .select('id')
      .eq('claim_id', fallRow.claim_id)
      .eq('user_id', userId)
      .eq('rolle', 'geschaedigter')
      .limit(1)
      .maybeSingle()
    if (party) {
      return {
        ok: true,
        fallId: fallRow.id,
        claimId: fallRow.claim_id,
        kundeId: fallRow.kunde_id,
        leadId: fallRow.lead_id,
        kundenbetreuerId: fallRow.kundenbetreuer_id,
        svId: fallRow.sv_id,
      }
    }
  }

  // 2c) Lead-Email-Fallback — Kunde wurde frisch angelegt, kunde_id ist
  // noch nicht gesetzt + claim_parties.user_id auch nicht.
  if (email && fallRow.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('email')
      .eq('id', fallRow.lead_id)
      .maybeSingle()
    if ((lead?.email as string | null) === email) {
      return {
        ok: true,
        fallId: fallRow.id,
        claimId: fallRow.claim_id,
        kundeId: fallRow.kunde_id,
        leadId: fallRow.lead_id,
        kundenbetreuerId: fallRow.kundenbetreuer_id,
        svId: fallRow.sv_id,
      }
    }
  }

  return { ok: false, error: 'not_authorized' }
}
