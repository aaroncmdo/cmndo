// P2.3c — Termin-State-Transitions als assignee-generische Engine-Primitive.
// Konsolidiert die DB-State-Uebergaenge der AAR-864-Verlegungs-Maschine + die fehlende
// termin-level Cancel-Primitive. Auth / Notifications / Route-Vorschlaege / Fall-Storno+Billing
// bleiben im Consumer (termin-verlegung-actions.ts / storno-actions.ts) bis Phase-3-Repoint.
// verlege ist race-sicher ueber gutachter_termine_no_assignee_overlap (P2.2): neuer Slot wirft
// 23P01 bei Ueberlappung -> Rollback des alt-Status. Alle Ops idempotent (status-gegate Updates).

import type { SupabaseClient } from '@supabase/supabase-js'

const AKTIV = ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending'] as const

export type AbsageStatus = 'abgesagt' | 'storniert' | 'abgelehnt'

/**
 * Cancelt EINEN Termin (status -> terminal + cancelled_at + Grund). NICHT Fall-Storno/Billing
 * (das ist stornoFall/transitionFallStatus). Idempotent: nur wenn der Termin noch aktiv ist.
 */
export async function sageAb(
  terminId: string,
  opts?: { grund?: string; status?: AbsageStatus; db?: SupabaseClient },
): Promise<{ ok: true; terminId: string } | { ok: false; error: string; code: 'nicht_aktiv' | 'db' }> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const status = opts?.status ?? 'abgesagt'
  const patch: Record<string, unknown> = { status, cancelled_at: new Date().toISOString() }
  if (opts?.grund) patch.ablehnungsgrund = opts.grund
  const { data, error } = await db
    .from('gutachter_termine')
    .update(patch)
    .eq('id', terminId)
    .in('status', AKTIV as unknown as string[])
    .select('id')
  if (error) return { ok: false, error: error.message, code: 'db' }
  if (!data || data.length === 0) return { ok: false, error: 'Termin nicht (mehr) aktiv', code: 'nicht_aktiv' }
  return { ok: true, terminId }
}

export interface VerlegeInput {
  neuVon: string
  neuBis: string
  /** default 'verlegung_pending' (SV-Flow); 'bestaetigt' = Kunde-Sofort (alt -> verschoben). */
  neuerStatus?: 'verlegung_pending' | 'bestaetigt'
  initiatorKunde?: boolean
  grund?: string
  db?: SupabaseClient
}
export type VerlegeResult =
  | { ok: true; neuerTerminId: string }
  | { ok: false; error: string; code: 'alt_nicht_aktiv' | 'belegt' | 'db' }

/**
 * Verschiebt einen Termin: alt -> 'verlegt' (bzw. 'verschoben' bei Kunde-Sofort) + neuer Slot
 * (race-sicher via Constraint; 23P01 -> Rollback alt). Spiegelt AAR-864 terminVerlegung*Vorschlagen
 * als reine DB-Transition (Auth/Notify = Caller).
 */
export async function verlege(terminId: string, input: VerlegeInput): Promise<VerlegeResult> {
  const db = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const neuerStatus = input.neuerStatus ?? 'verlegung_pending'
  const altNeuStatus = neuerStatus === 'bestaetigt' ? 'verschoben' : 'verlegt'

  const { data: alt, error: ladeErr } = await db
    .from('gutachter_termine')
    .select('id, assignee_id, assignee_typ, sv_lead_id, fall_id, claim_id, kb_id, kanal, typ, status')
    .eq('id', terminId)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message, code: 'db' }
  if (!alt || !(AKTIV as unknown as string[]).includes(alt.status as string))
    return { ok: false, error: 'Quell-Termin nicht aktiv', code: 'alt_nicht_aktiv' }

  // 1) alt umschalten (idempotenz-gegate auf den geladenen Status)
  const { data: altUpd, error: altErr } = await db
    .from('gutachter_termine')
    .update({
      status: altNeuStatus,
      verlegung_grund: input.grund ?? null,
      ...(input.initiatorKunde ? { verlegung_initiator_kunde: true } : {}),
    })
    .eq('id', alt.id)
    .eq('status', alt.status as string)
    .select('id')
  if (altErr) return { ok: false, error: altErr.message, code: 'db' }
  if (!altUpd || altUpd.length === 0) return { ok: false, error: 'Quell-Termin race', code: 'alt_nicht_aktiv' }

  // 2) neuen Slot anlegen (race-sicher via Constraint; CMM-49: assignee direkt aus alt
  //    geschrieben, sv_id nicht mehr — der Normalize-Trigger ist damit no-op)
  const { data: neu, error: insErr } = await db
    .from('gutachter_termine')
    .insert({
      assignee_id: alt.assignee_id,
      assignee_typ: alt.assignee_typ,
      sv_lead_id: alt.sv_lead_id,
      fall_id: alt.fall_id,
      claim_id: alt.claim_id,
      kb_id: alt.kb_id,
      kanal: alt.kanal,
      typ: alt.typ ?? 'sv_begutachtung',
      start_zeit: input.neuVon,
      end_zeit: input.neuBis,
      status: neuerStatus,
      verlegung_quelle_id: alt.id,
      verlegung_grund: input.grund ?? null,
      ...(input.initiatorKunde ? { verlegung_initiator_kunde: true } : {}),
    })
    .select('id')
    .single()
  if (insErr || !neu) {
    // Rollback alt
    await db
      .from('gutachter_termine')
      .update({ status: alt.status as string, verlegung_grund: null })
      .eq('id', alt.id)
    if (insErr?.code === '23P01') return { ok: false, error: 'Neuer Slot belegt', code: 'belegt' }
    return { ok: false, error: insErr?.message ?? 'Insert fehlgeschlagen', code: 'db' }
  }
  return { ok: true, neuerTerminId: neu.id as string }
}

/**
 * Entscheidet eine pending Verlegung. bestaetigen: neu -> bestaetigt, alt(verlegt) -> verschoben +
 * cancelled_at. ablehnen: neu -> storniert + cancelled_at, alt(verlegt) -> bestaetigt (Rollback).
 * Spiegelt AAR-864 terminVerlegungBestaetigen/Ablehnen (Auth = Caller).
 */
export async function entscheideVerlegung(
  neuerTerminId: string,
  entscheidung: 'bestaetigen' | 'ablehnen',
  opts?: { grund?: string; db?: SupabaseClient },
): Promise<{ ok: true } | { ok: false; error: string; code: 'nicht_pending' | 'db' }> {
  const db = opts?.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const { data: neu, error: ladeErr } = await db
    .from('gutachter_termine')
    .select('id, status, verlegung_quelle_id')
    .eq('id', neuerTerminId)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message, code: 'db' }
  if (!neu || neu.status !== 'verlegung_pending' || !neu.verlegung_quelle_id)
    return { ok: false, error: 'Slot nicht im Status verlegung_pending', code: 'nicht_pending' }

  const now = new Date().toISOString()
  if (entscheidung === 'bestaetigen') {
    const { data: u1, error: e1 } = await db
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', neu.id)
      .eq('status', 'verlegung_pending')
      .select('id')
    if (e1) return { ok: false, error: e1.message, code: 'db' }
    if (!u1 || u1.length === 0) return { ok: false, error: 'race', code: 'nicht_pending' }
    const { error: e2 } = await db
      .from('gutachter_termine')
      .update({ status: 'verschoben', cancelled_at: now })
      .eq('id', neu.verlegung_quelle_id)
      .eq('status', 'verlegt')
    if (e2) {
      await db.from('gutachter_termine').update({ status: 'verlegung_pending' }).eq('id', neu.id)
      return { ok: false, error: e2.message, code: 'db' }
    }
    return { ok: true }
  } else {
    const { data: u1, error: e1 } = await db
      .from('gutachter_termine')
      .update({ status: 'storniert', cancelled_at: now, verlegung_grund: opts?.grund ?? null })
      .eq('id', neu.id)
      .eq('status', 'verlegung_pending')
      .select('id')
    if (e1) return { ok: false, error: e1.message, code: 'db' }
    if (!u1 || u1.length === 0) return { ok: false, error: 'race', code: 'nicht_pending' }
    const { error: e2 } = await db
      .from('gutachter_termine')
      .update({ status: 'bestaetigt' })
      .eq('id', neu.verlegung_quelle_id)
      .eq('status', 'verlegt')
    if (e2) {
      await db
        .from('gutachter_termine')
        .update({ status: 'verlegung_pending', cancelled_at: null })
        .eq('id', neu.id)
      return { ok: false, error: e2.message, code: 'db' }
    }
    return { ok: true }
  }
}
