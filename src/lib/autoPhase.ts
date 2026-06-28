import { createServiceClient } from '@/lib/supabase/server'
import { triggerGutachterTerminTask, triggerQcTask, triggerArchivierungTask } from '@/lib/tasking'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import { getCurrentClaimPayment } from '@/lib/faelle/claim-payments'
import { computeNextOperativePhase, type OperativeSignals } from '@/lib/autophase-decision'

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
  // AAR-583 (N6): vollmacht_unterschrieben-Bool → vollmacht_signiert_am-Timestamp.
  // Bool-Semantik bleibt: Vollmacht erhalten wenn Timestamp gesetzt.
  if (lead.sa_unterschrieben && !!lead.vollmacht_signiert_am && phase !== 'konvertiert' && phase !== 'disqualifiziert') {
    updates.qualifizierungs_phase = 'konvertiert'
  }

  if (Object.keys(updates).length > 0) {
    await svc.from('leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', leadId)
  }
}

/**
 * Check if a fall should automatically move to a new phase based on its data.
 * Also triggers the corresponding tasks.
 *
 * Kanzlei-Strecke-Investigation 28.06.: liest die Signale jetzt LIVE aus den Sub-Entities
 * (claims/gutachten/gutachter_termine/kanzlei_faelle/claim_payments) statt aus
 * v_faelle_mit_aktuellem_termin — die View liefert mandatsnummer/sv_termin/
 * gutachten_eingegangen_am/filmcheck_ok nach CMM-49 als NULL, wodurch die Engine fuer
 * ALLE Claims tot war (74/89 auf sv-termin eingefroren). Die Phasen-Entscheidung selbst
 * lebt in computeNextOperativePhase (autophase-decision.ts, unit-getestet).
 */
export async function checkFallAutoPhase(fallId: string) {
  const svc = createServiceClient()

  // fallId -> claimId via Bridge (alle Faelle haben eine Bridge-Row, AAR-939).
  const { data: bridge } = await svc
    .from('faelle_claim_bridge')
    .select('claim_id')
    .eq('fall_id', fallId)
    .maybeSingle()
  const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null
  if (!claimId) return

  const { data: claim } = await svc
    .from('claims')
    .select('operative_status, service_typ, sv_id, kundenbetreuer_id')
    .eq('id', claimId)
    .single()
  const status = (claim?.operative_status as string | null) ?? null
  if (!claim || !status) return

  // Live-Signale parallel laden (claim-native, nicht aus der toten View).
  const [gutachtenRes, terminRes, kanzleiRes, currentPayment] = await Promise.all([
    svc.from('gutachten').select('fertiggestellt_am').eq('claim_id', claimId)
      .not('fertiggestellt_am', 'is', null).limit(1).maybeSingle(),
    svc.from('gutachter_termine').select('id').eq('claim_id', claimId)
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt']).limit(1).maybeSingle(),
    svc.from('kanzlei_faelle').select('anschlussschreiben_am').eq('claim_id', claimId).maybeSingle(),
    getCurrentClaimPayment(svc, claimId),
  ])

  const signals: OperativeSignals = {
    hasSvId: !!(claim.sv_id as string | null),
    hasTermin: !!terminRes.data,
    gutachtenFertig: !!(gutachtenRes.data as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am,
    istKomplett: (claim.service_typ as string | null) === 'komplett',
    anschlussschreibenVorhanden: !!(kanzleiRes.data as { anschlussschreiben_am?: string | null } | null)?.anschlussschreiben_am,
    zahlungEingegangen: !!currentPayment?.zahlungseingang_am,
  }

  const newStatus = computeNextOperativePhase(status, signals)
  if (!newStatus || newStatus === status) return

  // KFZ-202: State-Machine statt direktem Update.
  try {
    await transitionFallStatus(fallId, newStatus)
  } catch {
    // Transition nicht erlaubt — autoPhase ueberspringt.
    return
  }

  // Tasks fuer die neue Phase.
  const kbId = claim.kundenbetreuer_id as string | null
  const svId = claim.sv_id as string | null
  if (newStatus === 'sv-zugewiesen' && svId) {
    triggerGutachterTerminTask(fallId, svId).catch(() => {})
  }
  if (newStatus === 'filmcheck') {
    // KB-QC-Task am filmcheck-Eintritt. Die Kanzlei-Paket-/AS-Tasks fuer den Handoff
    // erstellt qcBestanden (filmcheck.ts) — autoPhase springt bewusst NICHT nach
    // kanzlei-uebergeben (Halb-automatik-Grenze, Aaron 28.06.).
    triggerQcTask(fallId, kbId).catch(() => {})
  }
  if (newStatus === 'abgeschlossen') {
    triggerArchivierungTask(fallId, kbId).catch(() => {})
  }
}
