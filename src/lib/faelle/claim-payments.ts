// CMM-44 SP-J Bucket A: Zahlungs-Reroute faelle -> claim_payments.
//
// Die faelle-Spalten zahlung_eingegangen_am / zahlung_betrag / zahlungsweg sind
// nach claim_payments gewandert (Rename: zahlungseingang_am / erhaltener_betrag /
// zahlungsweg). claim_payments ist 1:N pro Claim OHNE UNIQUE auf claim_id ->
// "aktuelle" Zahlung = neueste Row (created_at DESC). Pre-launch 0 Rows, daher
// legt der erste Write bei Bedarf eine Row an (create-or-update).
//
// Reine Funktionen mit explizitem DB-Client-Param (kein 'use server') -> von
// state-machine, lexdrive process-event und Server-Actions importierbar.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

export type ClaimPaymentRerouteFields = {
  zahlungseingang_am?: string | null
  erhaltener_betrag?: number | null
  zahlungsweg?: string | null
  zahlungsreferenz?: string | null
  /**
   * claim_payments.status ist NOT NULL DEFAULT 'ausstehend'
   * (CHECK in ausstehend|teilweise|erhalten|final|abgelehnt). Beim
   * Zahlungseingang explizit 'erhalten' setzen; bei reiner Methoden-/Payout-
   * Erfassung (z.B. Kunde waehlt Zahlungsweg) weglassen -> der INSERT faellt auf
   * den DB-Default 'ausstehend' zurueck, ein UPDATE laesst den Status unberuehrt.
   */
  status?: 'ausstehend' | 'teilweise' | 'erhalten' | 'final' | 'abgelehnt'
}

/**
 * Schreibt die uebergebenen Felder auf die aktuelle claim_payments-Row eines
 * Claims (create-or-update). Felder sind bereits claim_payments-benannt.
 */
export async function upsertCurrentClaimPayment(
  db: DbClient,
  claimId: string,
  fields: ClaimPaymentRerouteFields,
  createdByUserId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (Object.keys(fields).length === 0) return { ok: true }

  const { data: current, error: selErr } = await db
    .from('claim_payments')
    .select('id')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (selErr) return { ok: false, error: selErr.message }

  if (current?.id) {
    const { error } = await db.from('claim_payments').update(fields).eq('id', current.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await db
      .from('claim_payments')
      .insert({ claim_id: claimId, ...fields, created_by_user_id: createdByUserId ?? null })
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

// ── Payment-Ledger-Normalisierung: kanonischer Write-Seam ────────────────────
// Design: docs/superpowers/specs/2026-07-07-payment-ledger-normalisierung-design.md

export type Partei = 'vs' | 'kunde' | 'sv'

export type ClaimPaymentFields = {
  forderungsbetrag?: number | null
  erhaltener_betrag?: number | null
  zahlungseingang_am?: string | null
  zahlungsweg?: string | null
  status?: 'ausstehend' | 'teilweise' | 'erhalten' | 'final' | 'abgelehnt'
}

/**
 * Kanonischer Write-Seam: schreibt die (claim_id, partei)-Ledger-Zeile
 * (create-or-update via unique(claim_id, partei)). richtung wird aus partei
 * abgeleitet (vs -> eingang, kunde/sv -> auszahlung). Ersetzt schrittweise
 * upsertCurrentClaimPayment, das die neueste Row blind (empfaenger-agnostisch) traf.
 */
export async function upsertClaimPayment(
  db: DbClient,
  claimId: string,
  partei: Partei,
  fields: ClaimPaymentFields,
  createdByUserId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const richtung: 'eingang' | 'auszahlung' = partei === 'vs' ? 'eingang' : 'auszahlung'

  const { data: current, error: selErr } = await db
    .from('claim_payments')
    .select('id')
    .eq('claim_id', claimId)
    .eq('partei', partei)
    .maybeSingle()
  if (selErr) return { ok: false, error: selErr.message }

  if (current?.id) {
    const { error } = await db.from('claim_payments').update({ ...fields, richtung }).eq('id', current.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await db
      .from('claim_payments')
      .insert({ claim_id: claimId, partei, richtung, ...fields, created_by_user_id: createdByUserId ?? null })
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

export type CurrentClaimPayment = {
  zahlungseingang_am: string | null
  erhaltener_betrag: number | null
  zahlungsweg: string | null
}

/**
 * Liest die aktuelle (neueste) claim_payments-Row eines Claims. Property-Namen
 * sind claim_payments-benannt; der Consumer renamed zurueck auf den faelle-
 * Vertrag (zahlung_eingegangen_am/zahlung_betrag/zahlungsweg) wo noetig.
 * Pre-launch 0 Rows -> null.
 */
export async function getCurrentClaimPayment(
  db: DbClient,
  claimId: string,
): Promise<CurrentClaimPayment | null> {
  const { data, error } = await db
    .from('claim_payments')
    .select('zahlungseingang_am, erhaltener_betrag, zahlungsweg')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Lese-Fehler werfen wir nicht (graceful: "keine Zahlung"), loggen ihn aber —
  // sonst wird ein transienter DB-Fehler still als "kein Zahlungseingang"
  // interpretiert (z.B. autoPhase schliesst dann faelschlich nicht ab).
  if (error) {
    console.error('[CMM-44 SP-J] getCurrentClaimPayment fehlgeschlagen:', error.message)
    return null
  }
  return (data as CurrentClaimPayment | null) ?? null
}
