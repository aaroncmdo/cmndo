// AAR-956 Dead-Pin-Fallback — Body: bucheDeadPinTermin (WRITE-ONLY).
//
// Schreibt einen dispatch_pending-Termin auf einen sv_leads-Dead-Pin. KEIN Versand:
// Kunde+Team-Notify macht der Embed (generisches „Kfz-Gutachter in {ort}"-Label), der
// SV/Dead-Pin wird NIE benachrichtigt. Landet zur MANUELLEN Koordination beim Dispatch
// (Queue = status='dispatch_pending' AND assignee_typ='sv_lead').
//
// KEIN 'use server' (plain server-Modul, aufgerufen aus dem Embed-onKeinMatch-Pfad) und
// KEINE Server-Imports in ./fallback (das bleibt reine Typ-Ebene fuer Client-Import).
//
// Live-verifizierte Constraints (gutachter_termine, 2026-06-12):
//   - status-CHECK: 'dispatch_pending' (neu in dieser Strecke ergaenzt) — sonst 23514.
//   - quelle-CHECK: nur dispatch|self_service|manuell → 'self_service' (anon Self-Service-Finder;
//     'dead_pin_fallback' existiert NICHT — Dispatch diskriminiert via status+assignee_typ).
//   - kanal-CHECK: nur telefon|video → kanal WEGLASSEN (Vor-Ort-Begutachtung hat keinen Remote-Kanal).
//   - Exclusion-Constraint exempt fuer dispatch_pending → „immer buchbar" (Dispatch dedupliziert
//     beim Confirm). Darum direkter Insert statt reserviere (dessen Race-Safety hier moot ist).
//   - validate_assignee-Trigger validiert assignee_typ='sv_lead' gegen sv_leads automatisch.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { assigneeLegacyPatch, type Assignee } from '@/lib/termine/engine'
import type { BucheDeadPinTermin } from './fallback'

const TERMIN_DAUER_MIN = 90

export const bucheDeadPinTermin: BucheDeadPinTermin = async ({ token, deadPinId, startIso }) => {
  const db = createAdminClient()

  // 1) token → lead (eigener flow_links-Read; NICHT resolveFlowLead aus src/app/flow importieren
  //    → Layer-Inversion Engine→app). Gueltigkeit gespiegelt von /flow/[token]/actions.ts:
  //    lead_id vorhanden, Link nicht abgeschlossen, nicht abgelaufen.
  const { data: flow } = await db
    .from('flow_links')
    .select('lead_id, status, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!flow?.lead_id) return { ok: false, error: 'Link ungültig' }
  if (flow.status === 'abgeschlossen') return { ok: false, error: 'Link ungültig' }
  if (flow.expires_at && new Date(flow.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Link abgelaufen' }
  }
  const leadId = flow.lead_id

  // 2) Direkter Insert. assignee=sv_lead (Dead-Pin) + Legacy-FK sv_lead_id (Dual-Write via
  //    assigneeLegacyPatch, wie reserviere). bezug=lead nativ — KEIN Legacy lead_id (validate-
  //    Trigger-Falle + findeTerminFuerLead-Doppelmatch).
  const assignee: Assignee = { typ: 'sv_lead', id: deadPinId }
  const endIso = new Date(new Date(startIso).getTime() + TERMIN_DAUER_MIN * 60_000).toISOString()
  const { data, error } = await db
    .from('gutachter_termine')
    .insert({
      assignee_typ: assignee.typ,
      assignee_id: assignee.id,
      ...assigneeLegacyPatch(assignee),
      bezug_typ: 'lead',
      bezug_id: leadId,
      status: 'dispatch_pending',
      start_zeit: startIso,
      end_zeit: endIso,
      quelle: 'self_service',
      typ: 'sv_begutachtung',
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // 3) KEINE Notification (write-only). 4) Dispatch-Queue (dispatch_pending sv_lead) refreshen.
  revalidatePath('/dispatch/leads')
  return { ok: true, terminId: data!.id as string }
}
