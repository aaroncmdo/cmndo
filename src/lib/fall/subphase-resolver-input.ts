// CMM-44 MP-2: Server-Loader, der die §8-Owning-Sub-Entities für resolveSubphase
// assembliert (Read-Swap weg von v_faelle_mit_aktuellem_termin). EINE Stelle für
// die Trigger-Feld-Assembly, damit sie nicht pro Portal driftet — analog
// getClaimLifecycleForClaim (System A, lib/claims). Reads laufen über den
// Admin-Client (rollenunabhängige, vollständige Ableitung der Subphase; die
// Fallakte ist bereits auth-/rollen-gegated).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAlleAuftraege } from '@/lib/auftrag/queries'
import { getKanzleiFall } from '@/lib/kanzlei-fall/queries'
import type {
  ResolverInput,
  ClaimTriggers,
  LeadTriggers,
  GutachtenTriggers,
  GutachterTerminRow,
  WebhookEventRow,
} from '@/lib/fall/subphase-resolver'

const CLAIM_SELECT =
  'status, szenario, service_typ, sa_unterschrieben_am, vollmacht_status, vollmacht_geprueft_am, ' +
  'kanzlei_uebergeben_am, dokumente_reminder_whatsapp_letzte_sendung, abgeschlossen_am, ' +
  'google_review_gesendet, kanzlei_provision_status, auszahlung_gutachter_eingegangen_am'

// gutachter_termine: erweitert um start_zeit (2.6) + termin_erinnerung_5min_gesendet (2.6)
// + nachbesichtigung_status (6e), die der re-basete Resolver jetzt von der
// Owning-Entity statt aus der faelle-View liest.
const TERMIN_SELECT =
  'id, fall_id, typ, status, start_zeit, sv_unterwegs_seit, sv_angekommen_am, durchgefuehrt_am, ' +
  'termin_erinnerung_5min_gesendet, nachbesichtigung_status'

/**
 * Lädt die Trigger-Felder aller Owning-Sub-Entities eines Falls für den
 * subphase-resolver. fallId keyt auftraege/kanzlei_faelle/gutachter_termine;
 * claimId keyt claims/gutachten; leadId keyt leads (alle aus der fall-Row).
 */
export async function getSubphaseResolverInput(
  admin: SupabaseClient,
  args: { fallId: string; claimId: string | null; leadId: string | null },
): Promise<Omit<ResolverInput, 'now'>> {
  const { fallId, claimId, leadId } = args

  const [claimRes, leadRes, auftraege, kanzleiFall, gutachtenRes, termineRes, webhookRes] = await Promise.all([
    claimId
      ? admin.from('claims').select(CLAIM_SELECT).eq('id', claimId).maybeSingle()
      : Promise.resolve({ data: null }),
    leadId
      ? admin.from('leads').select('zb1_status, fin, cardentity_enriched_at').eq('id', leadId).maybeSingle()
      : Promise.resolve({ data: null }),
    getAlleAuftraege(admin, fallId),
    getKanzleiFall(admin, fallId),
    claimId
      ? admin.from('gutachten').select('ocr_status, pdf_uploaded_at').eq('claim_id', claimId)
      : Promise.resolve({ data: [] }),
    admin.from('gutachter_termine').select(TERMIN_SELECT).eq('fall_id', fallId),
    admin
      .from('webhook_events')
      .select('event_type, fall_id, processed_at, source')
      .eq('fall_id', fallId)
      .in('event_type', ['kb_filmcheck_bestanden']),
  ])

  return {
    claim: (claimRes.data as ClaimTriggers | null) ?? null,
    lead: (leadRes.data as LeadTriggers | null) ?? null,
    kanzleiFall,
    auftraege,
    gutachten: (gutachtenRes.data ?? []) as GutachtenTriggers[],
    gutachter_termine: (termineRes.data ?? []) as unknown as GutachterTerminRow[],
    webhook_events: (webhookRes.data ?? []) as unknown as WebhookEventRow[],
  }
}
