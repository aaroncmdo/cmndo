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
  // CMM-44 SP-A: kundenbetreuer_id ist eine claims-Duplikat-Spalte (claims =
  // SSoT). Statt faelle.kundenbetreuer_id wird sie via nested embed aus dem
  // verknuepften claims-Datensatz mitgelesen — die faelle-Spalte wird in PR2
  // gedroppt. Nested embed spart den separaten Round-Trip.
  // CMM-49 (faelle-Drop-Runway): Anker faelle_claim_bridge statt .from('faelle').
  // kunde_id -> claims.geschaedigter_user_id (div=0, IDENTISCHER denormalisierter Wert wie
  // faelle.kunde_id -> value-neutral; gleiches Drift-Profil). Der claim_parties-Pfad (2b) bleibt
  // der verlaessliche Ownership-SSoT als Safety-Net. lead_id/sv_id/kundenbetreuer_id claims-nativ.
  const { data: fall } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id, claim_id, claims:claims!fk_bridge_claim(geschaedigter_user_id, lead_id, sv_id, kundenbetreuer_id)')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!fall) return { ok: false, error: 'not_found' }

  const fallBase = fall as unknown as {
    fall_id: string
    claim_id: string | null
    claims?:
      | { geschaedigter_user_id: string | null; lead_id: string | null; sv_id: string | null; kundenbetreuer_id: string | null }
      | { geschaedigter_user_id: string | null; lead_id: string | null; sv_id: string | null; kundenbetreuer_id: string | null }[]
      | null
  }

  const claim = Array.isArray(fallBase.claims) ? fallBase.claims[0] : fallBase.claims
  const fallRow = {
    id: fallBase.fall_id,
    claim_id: fallBase.claim_id,
    kunde_id: claim?.geschaedigter_user_id ?? null,
    lead_id: claim?.lead_id ?? null,
    sv_id: claim?.sv_id ?? null,
    kundenbetreuer_id: claim?.kundenbetreuer_id ?? null,
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

// CMM-63 PR2 (Route-Key-Switch faelle.id → claim_id):
// Claim-natives Pendant zu assertKundeOwnsFall. Nimmt eine `claim_id` (neuer
// Route-Key des kunde-Portals) statt faelle.id und liest `claims` als Basis-Row.
//
// Ownership-Check = (claims.geschaedigter_user_id OR claim_parties(geschaedigter).user_id
// OR Lead-Email) — die Reihenfolge der 2a/2b/2c-Zweige ist nur Short-Circuit, das Prädikat
// ist ein OR (kein Zweig ändert das Ergebnis-Set).
// CMM-49 (Option A, Aaron 15.06.): claims.geschaedigter_user_id ist der KANONISCHE
// Ownership-SSoT — div=0 vs faelle.kunde_id (75/75), am vollständigsten, RLS-genutzt + von
// auto-claim/create-for-fall direkt geschrieben. claim_parties.user_id bleibt OR-Erweiterung
// (Multi-Party/Airdrop ruht: 0 Rows → kein Sync-Trigger nötig bis zur Aktivierung). Die
// frühere „driftet (CLM-2026-00115)"-Warnung war eine fehlende Party-Row, kein Wertkonflikt.
//
// `fallId` wird mitgeliefert, weil timeline / fall_dokumente / pflichtdokumente noch
// auf `faelle.id` keyen (FK-Repoint erst in Phase 6). Bis dahin Transitions-Brücke.
export type KundeClaimOwnershipResult =
  | {
      ok: true
      claimId: string
      fallId: string | null
      leadId: string | null
      kundenbetreuerId: string | null
      svId: string | null
    }
  | { ok: false; error: 'not_found' | 'not_authorized' }

export async function assertKundeOwnsClaim(
  admin: DbClient,
  userId: string,
  email: string | null,
  claimId: string,
): Promise<KundeClaimOwnershipResult> {
  // 1. Claim laden (claims = SSoT)
  const { data: claim } = await admin
    .from('claims')
    .select('id, lead_id, kundenbetreuer_id, sv_id, geschaedigter_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (!claim) return { ok: false, error: 'not_found' }

  const claimRow = claim as {
    id: string
    lead_id: string | null
    kundenbetreuer_id: string | null
    sv_id: string | null
    geschaedigter_user_id: string | null
  }

  // fallId-Transitions-Brücke: timeline/fall_dokumente/pflichtdokumente keyen noch
  // auf faelle.id. Die (1:1 während Übergang) zugehörige faelle.id mitliefern.
  // CMM-49 (faelle-Drop-Runway): fallId-Bruecke via Bridge statt .from('faelle'). bridge.fall_id == faelle.id.
  const { data: f } = await admin
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claimId)
    .limit(1)
    .maybeSingle()

  const resolved = {
    claimId: claimRow.id,
    fallId: (f?.fall_id as string | null) ?? null,
    leadId: claimRow.lead_id,
    kundenbetreuerId: claimRow.kundenbetreuer_id,
    svId: claimRow.sv_id,
  }

  // 2a) claim_parties(geschaedigter).user_id — verlässlicher Ownership-SSoT
  const { data: party } = await admin
    .from('claim_parties')
    .select('id')
    .eq('claim_id', claimId)
    .eq('user_id', userId)
    .eq('rolle', 'geschaedigter')
    .limit(1)
    .maybeSingle()
  if (party) return { ok: true, ...resolved }

  // 2b) claims.geschaedigter_user_id (denormalisierter Fallback)
  if (claimRow.geschaedigter_user_id === userId) return { ok: true, ...resolved }

  // 2c) Lead-Email-Fallback (frisch konvertiert, claim_parties noch nicht gepflegt)
  if (email && claimRow.lead_id) {
    const { data: lead } = await admin
      .from('leads')
      .select('email')
      .eq('id', claimRow.lead_id)
      .maybeSingle()
    if ((lead?.email as string | null) === email) return { ok: true, ...resolved }
  }

  return { ok: false, error: 'not_authorized' }
}
