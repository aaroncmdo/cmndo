import { createServiceClient } from '@/lib/supabase/server'
import { triggerGutachterTerminTask, triggerGutachtenUploadTask, triggerQcTask, triggerKanzleiPaketTask, triggerAsSendedatumTask, triggerArchivierungTask } from '@/lib/tasking'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

/**
 * Check if a lead should automatically move to a new phase based on its data.
 */
export async function checkLeadAutoPhase(leadId: string) {
  const svc = createServiceClient()
  const { data: lead } = await svc.from('leads').select('*').eq('id', leadId).single()
  if (!lead) return

  const phase = lead.qualifizierungs_phase as string | null
  const updates: Record<string, unknown> = {}

  if (lead.schadens_fall_typ && (phase === 'neu' || phase === 'nicht-erreicht')) {
    updates.qualifizierungs_phase = 'in-qualifizierung'
  }
  if (lead.flow_token && phase === 'in-qualifizierung') {
    updates.qualifizierungs_phase = 'flow-versendet'
  }
  if (lead.sa_unterschrieben && lead.vollmacht_unterschrieben && phase !== 'konvertiert' && phase !== 'disqualifiziert') {
    updates.qualifizierungs_phase = 'konvertiert'
  }

  if (Object.keys(updates).length > 0) {
    await svc.from('leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', leadId)
  }
}

/**
 * Check if a fall should automatically move to a new phase based on its data.
 * Also triggers the corresponding tasks.
 */
export async function checkFallAutoPhase(fallId: string) {
  const svc = createServiceClient()
  const { data: fall } = await svc.from('faelle').select('*').eq('id', fallId).single()
  if (!fall) return

  const status = fall.status as string
  let newStatus: string | null = null

  if (fall.sv_id && status === 'ersterfassung') newStatus = 'sv-zugewiesen'
  if (fall.sv_termin && status === 'sv-zugewiesen') newStatus = 'sv-termin'
  if (fall.gutachten_eingegangen_am && (status === 'sv-termin' || status === 'besichtigung')) newStatus = 'gutachten-eingegangen'
  if (fall.filmcheck_ok && status === 'gutachten-eingegangen') newStatus = 'filmcheck'
  if (fall.mandatsnummer && status === 'filmcheck') newStatus = 'kanzlei-uebergeben'
  if (fall.anschlussschreiben_am && status === 'kanzlei-uebergeben') newStatus = 'anschlussschreiben'
  if (fall.zahlung_eingegangen_am && (status === 'anschlussschreiben' || status === 'regulierung')) newStatus = 'abgeschlossen'

  if (newStatus && newStatus !== status) {
    // KFZ-202 Fix: State-Machine statt direktem Update
    try {
      await transitionFallStatus(fallId, newStatus)
    } catch {
      // Transition nicht erlaubt — autoPhase überspringt
      return
    }

    // Trigger tasks for the new phase
    const kbId = fall.kundenbetreuer_id as string | null
    const svId = fall.sv_id as string | null

    if (newStatus === 'sv-zugewiesen' && svId) {
      triggerGutachterTerminTask(fallId, svId).catch(() => {})
    }
    if (newStatus === 'gutachten-eingegangen') {
      triggerQcTask(fallId, kbId).catch(() => {})
    }
    if (newStatus === 'filmcheck' || newStatus === 'kanzlei-uebergeben') {
      triggerKanzleiPaketTask(fallId, kbId).catch(() => {})
      triggerAsSendedatumTask(fallId, kbId).catch(() => {})
    }
    if (newStatus === 'abgeschlossen') {
      triggerArchivierungTask(fallId, kbId).catch(() => {})
    }
  }
}
