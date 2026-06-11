// Booking-Repoint-Bridge (AAR-956 T2 Follow-up): bezug-nativer Lead-Termin-Lookup.
//
// Hintergrund: die universelle Termin-Engine (`reserviere` / `planeTermin(buchen)`)
// schreibt NUR `bezug_typ`/`bezug_id`, KEIN `lead_id` (bewusst — Legacy-bezug triggert
// die validate-Trigger-Falle, siehe engine/writes.ts:37). Die /flow-Reader finden ihre
// Termine aber bisher per `.eq('lead_id', leadId)`. Damit der Booking-Repoint OHNE
// Backfill funktioniert, deckt dieser Helper BEIDE Repräsentationen ab (DUAL-Lookup):
//   - Legacy:  lead_id = leadId            (alte bucheTerminFlow-Inserts)
//   - Engine:  bezug_typ='lead' AND bezug_id=leadId   (reserviere/planeTermin(buchen))
//
// Bewusst KEIN 'use server' (reine Util, importierbar). Zwei parametrisierte Queries +
// Merge/Dedup (statt `.or()`-String-Interpolation) — race-/injection-unkritisch.

import type { SupabaseClient } from '@supabase/supabase-js'

export type LeadTermin = { id: string; sv_id: string | null }

const AKTIV_STATUS = ['reserviert', 'bestaetigt']
// CMM-49 sv_id-Drop: intern auf assignee_id/typ lesen; Return-Feld `sv_id` (LeadTermin)
// bleibt als Alias erhalten (value-identisch fuer SV-Termine) → flow/[token]/actions.ts:593
// (existingTermin.sv_id) unveraendert.
const SELECT = 'id, assignee_id, assignee_typ, start_zeit'

type Row = { id: string; assignee_id: string | null; assignee_typ: string | null; start_zeit: string }

/**
 * Jüngster AKTIVER (reserviert|bestaetigt) gutachter_termine eines Leads, oder null.
 * DUAL-Lookup (transition-sicher, kein Backfill): findet Legacy- (lead_id) UND
 * engine-reservierte (bezug_typ='lead'/bezug_id) Termine; bei Überschneidung dedupt
 * per id. Sortiert start_zeit desc → das erste Element ist der neueste aktive Termin.
 * Drop-in für flow/[token]/actions.ts:588 (signSAandCreateFall: svIdFromTermin + aktiverTerminId).
 */
export async function findeTerminFuerLead(db: SupabaseClient, leadId: string): Promise<LeadTermin | null> {
  const [bezugRes, legacyRes] = await Promise.all([
    db.from('gutachter_termine').select(SELECT).eq('bezug_typ', 'lead').eq('bezug_id', leadId).in('status', AKTIV_STATUS),
    db.from('gutachter_termine').select(SELECT).eq('lead_id', leadId).in('status', AKTIV_STATUS),
  ])
  const byId = new Map<string, { id: string; sv_id: string | null; start_zeit: string }>()
  for (const r of [...((bezugRes.data ?? []) as Row[]), ...((legacyRes.data ?? []) as Row[])]) {
    if (r?.id) byId.set(r.id, { id: r.id, sv_id: r.assignee_typ === 'sachverstaendiger' ? r.assignee_id ?? null : null, start_zeit: r.start_zeit })
  }
  const neuester = Array.from(byId.values()).sort((a, b) => (a.start_zeit < b.start_zeit ? 1 : -1))[0]
  return neuester ? { id: neuester.id, sv_id: neuester.sv_id } : null
}
