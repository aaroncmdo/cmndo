// KB-Fakt-getriebene Kanzlei-Strecke — Shared Core: Fakt schreiben -> Phase ableiten.
//
// EIN Schreibpfad fuer KB-gepflegte Kanzlei-Fakten (kein externes LexDrive-API). Schreibt
// das/die Feld(er) in die richtige Tabelle (via kanzleiFaktToUpdate), feuert die Kunde-Comm
// und ruft danach checkFallAutoPhase — die Phase leitet sich aus den (jetzt aktuellen) Fakten
// ab (operative_status == derive(facts), kein Drift). Reine Funktion mit explizitem DB-Client
// (kein 'use server') -> von Server-Actions UND einem kuenftigen LexDrive-Webhook nutzbar.
// Spec: docs/superpowers/specs/2026-06-29-kanzlei-kb-fakt-strecke-design.md

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { upsertCurrentClaimPayment } from '@/lib/faelle/claim-payments'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { kanzleiFaktToUpdate, type KanzleiFaktKey, type KanzleiFaktWert } from './fakt-mapping'

type DbClient = SupabaseClient<Database>

export async function applyKanzleiFakt(
  db: DbClient,
  fallId: string,
  faktKey: KanzleiFaktKey,
  wert: KanzleiFaktWert,
  userId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const claimId = await resolveClaimId(db, fallId)
  if (!claimId) return { ok: false, error: 'Fall nicht gefunden' }

  const upd = kanzleiFaktToUpdate(faktKey, wert)

  if (upd.kanzleiFaelle && Object.keys(upd.kanzleiFaelle).length > 0) {
    const r = await upsertKanzleiFall(db, claimId, upd.kanzleiFaelle)
    if (!r.ok) return { ok: false, error: r.error ?? 'kanzlei_faelle Update fehlgeschlagen' }
  }
  if (upd.claims && Object.keys(upd.claims).length > 0) {
    // dynamisches Update -> Cast am strict-typed Client (Felder sind echte claims-Spalten,
    // s. fakt-mapping.ts: abgeschlossen_am / geschlossen_grund).
    const { error } = await db.from('claims').update(upd.claims as never).eq('id', claimId)
    if (error) return { ok: false, error: error.message }
  }
  if (upd.payment && Object.keys(upd.payment).length > 0) {
    const r = await upsertCurrentClaimPayment(db, claimId, upd.payment, userId ?? null)
    if (!r.ok) return { ok: false, error: r.error ?? 'claim_payments Upsert fehlgeschlagen' }
  }

  // Kunde-Comm (non-critical, fire-and-forget) — genau einmal pro Fakt.
  if (upd.commKey) sendFallCommunication(fallId, upd.commKey).catch(() => {})

  // Phase aus den jetzt aktualisierten Fakten ableiten + transitionieren (+ Tasks).
  // Awaited, damit der Caller die neue Phase sofort sieht (checkFallAutoPhase nutzt intern
  // einen eigenen service-role-Client).
  await checkFallAutoPhase(fallId)

  return { ok: true }
}
