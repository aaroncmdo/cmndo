// Ops-Cockpit Phase 3 (Dispatch) — Lead-Work-Item-Loader.
// Liest v_lead_workstate (service_role-only) via createAdminClient() NACH einem
// PFLICHT-Role-Guard (dispatch/admin). adminClient OHNE Guard = IDOR
// (s. Memory AUDIT-route-role-gating) -> der Guard ist nicht optional, deshalb ein
// frischer, sorgfaeltiger Bau. Konsumiert die kanonische deriveLeadWorkflowState
// (kein Re-Derive der Qualifizierung).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  deriveLeadWorkflowState,
  type WorkflowLeadLike,
  type WorkflowFlowLink,
} from '@/app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState'
import type { AktiverTerminLike } from '@/app/dispatch/leads/[id]/_lib/qualification-engine'
import type { LeadWorkItem, LeadWorkstateRow } from './lead-workstate.types'

const STAFF_ROLES = new Set(['dispatch', 'admin'])

/**
 * Laedt die aktiven Leads als `LeadWorkItem`s fuers Dispatch-Cockpit.
 * @param supabase User-Context-Client (fuer den Role-Guard: auth.getUser + profiles.rolle).
 * @param opts.ownerId optional auf einen Dispatch-Owner (leads.zugewiesen_an) filtern.
 */
export async function getLeadWorkItems(
  supabase: SupabaseClient,
  opts: { ownerId?: string } = {},
): Promise<{ ok: true; items: LeadWorkItem[] } | { ok: false; error: string }> {
  // --- PFLICHT-Role-Guard: Lead-Cockpit = dispatch/admin. Ohne ihn waere der
  //     adminClient-Read auf die service_role-View ein IDOR (fremder Lead-Pool). ---
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (!STAFF_ROLES.has(((profile as { rolle?: string | null } | null)?.rolle ?? '') as string)) {
    return { ok: false, error: 'Nicht autorisiert' }
  }

  // --- Read via adminClient (v_lead_workstate = service_role-only, s. Migration).
  //     v_lead_workstate ist noch nicht in database.types -> any-Cast wie v_werkstatt_lead. ---
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any).from('v_lead_workstate').select('*')
  if (opts.ownerId) query = query.eq('zugewiesen_an', opts.ownerId)
  const { data, error } = await query
  if (error) return { ok: false, error: (error as { message?: string }).message ?? 'Fehler' }

  const rows = (data ?? []) as LeadWorkstateRow[]
  const items: LeadWorkItem[] = rows.map((row) => {
    const lead = row as unknown as WorkflowLeadLike
    const aktiverTermin: AktiverTerminLike = row.termin_status
      ? { status: row.termin_status }
      : null
    const hatFlowlink =
      row.fl_gesendet_am || row.fl_geoeffnet_am || row.fl_abgeschlossen_am || row.fl_fall_id
    const flowlink: WorkflowFlowLink = hatFlowlink
      ? {
          gesendet_am: row.fl_gesendet_am,
          geoeffnet_am: row.fl_geoeffnet_am,
          abgeschlossen_am: row.fl_abgeschlossen_am,
          fall_id: row.fl_fall_id,
        }
      : null
    const { state, qual } = deriveLeadWorkflowState(lead, aktiverTermin, flowlink)
    const title = [row.vorname, row.nachname].filter(Boolean).join(' ') || row.telefon || row.id
    return {
      kind: 'lead',
      id: row.id,
      ownerId: row.zugewiesen_an,
      state,
      qualCompleted: qual.completedCount,
      display: { title, telefon: row.telefon },
    }
  })
  return { ok: true, items }
}
