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

// Payment-Ledger Phase 4: das alte `upsertCurrentClaimPayment` (neueste-Row-blind,
// empfaenger-agnostisch) ist entfernt — 0 Consumer nach der partei-aware Migration (Schritt C).
// `ClaimPaymentRerouteFields` (oben) bleibt: lexdrive/process-event nutzt es noch fuer cpFields.

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
 * abgeleitet (vs -> eingang, kunde/sv -> auszahlung). Loeste `upsertCurrentClaimPayment`
 * ab (neueste-Row-blind, empfaenger-agnostisch; entfernt Phase 4).
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

export type ClaimPaymentRow = {
  forderungsbetrag: number | null
  erhaltener_betrag: number | null
  zahlungseingang_am: string | null
  status: string | null
}
export type ClaimPaymentsByPartei = {
  vs: ClaimPaymentRow | null
  kunde: ClaimPaymentRow | null
  sv: ClaimPaymentRow | null
}

/**
 * Read-Seam der Payment-Ledger-Normalisierung: liest die claim_payments-Zeilen eines Claims
 * und gruppiert sie nach partei (vs/kunde/sv). Loeste `getCurrentClaimPayment` ab
 * (neueste-Row-blind, empfaenger-agnostisch; entfernt Phase 4). Graceful: bei DB-Fehler alle-null.
 */
export async function getClaimPayments(db: DbClient, claimId: string): Promise<ClaimPaymentsByPartei> {
  const by: ClaimPaymentsByPartei = { vs: null, kunde: null, sv: null }
  const { data, error } = await db
    .from('claim_payments')
    .select('partei, forderungsbetrag, erhaltener_betrag, zahlungseingang_am, status')
    .eq('claim_id', claimId)
  if (error) {
    console.error('[Payment-Ledger] getClaimPayments fehlgeschlagen:', error.message)
    return by
  }
  for (const r of (data ?? []) as Array<{ partei: string } & ClaimPaymentRow>) {
    if (r.partei === 'vs' || r.partei === 'kunde' || r.partei === 'sv') {
      by[r.partei] = {
        forderungsbetrag: r.forderungsbetrag,
        erhaltener_betrag: r.erhaltener_betrag,
        zahlungseingang_am: r.zahlungseingang_am,
        status: r.status,
      }
    }
  }
  return by
}
