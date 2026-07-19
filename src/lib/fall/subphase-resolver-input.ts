// CMM-44 MP-2: Server-Loader, der die §8-Owning-Sub-Entities für resolveSubphase
// assembliert (Read-Swap weg von v_faelle_mit_aktuellem_termin). EINE Stelle für
// die Trigger-Feld-Assembly, damit sie nicht pro Portal driftet — analog
// getClaimLifecycleForClaim (System A, lib/claims). Reads laufen über den
// Admin-Client (rollenunabhängige, vollständige Ableitung der Subphase; die
// Fallakte ist bereits auth-/rollen-gegated).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAlleAuftraege } from '@/lib/auftrag/queries'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import { getKanzleiFall } from '@/lib/kanzlei-fall/queries'
import type {
  ResolverInput,
  ClaimTriggers,
  LeadTriggers,
  GutachtenTriggers,
  GutachterTerminRow,
  WebhookEventRow,
} from '@/lib/fall/subphase-resolver'

// Normalisierung Slice 4: auszahlung_gutachter_eingegangen_am NICHT mehr aus dem claims-Cache
// (wird retired), sondern aus dem (claim,'sv')-Ledger (claim_payments.zahlungseingang_am, s.u.).
// T3-slice-2b: claims.status -> operative_status
const CLAIM_SELECT =
  'operative_status, szenario, service_typ, sa_unterschrieben_am, vollmacht_status, vollmacht_geprueft_am, ' +
  'kanzlei_uebergeben_am, dokumente_reminder_whatsapp_letzte_sendung, abgeschlossen_am, ' +
  // WS6/Kasko-Fix: Direct-Reparatur-Gate im Resolver (kasko/selbstzahler -> Reparatur-Lane).
  'google_review_gesendet, kanzlei_provision_status, abrechnungsweg, reparatur_werkstatt_id'

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

  const [claimRes, leadRes, auftraege, kanzleiFall, gutachtenRes, termineRes, webhookRes, svLedgerRes, reparaturTerminRes] = await Promise.all([
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
    admin.from('gutachter_termine').select(TERMIN_SELECT).or(bezugOrExpr('fall', fallId)),
    admin
      .from('webhook_events')
      // CMM-49: webhook_events claim-gekeyt; claimId ist in scope (Z.41). Resolver liest nur event_type/processed_at.
      .select('event_type, claim_id, processed_at, source')
      .eq('claim_id', claimId ?? '00000000-0000-0000-0000-000000000000')
      .in('event_type', ['kb_filmcheck_bestanden']),
    // auszahlung_gutachter_eingegangen_am (sv-Am) aus dem (claim,'sv')-Ledger statt dem claims-Cache
    // (Normalisierung Slice 4 — die Cache-Spalte wird retired).
    claimId
      ? admin.from('claim_payments').select('zahlungseingang_am').eq('claim_id', claimId).eq('partei', 'sv').maybeSingle()
      : Promise.resolve({ data: null }),
    // WS6/Kasko-Fix: juengster Reparatur-Termin fuer das Direct-Reparatur-Gate
    // (kasko/selbstzahler); Sortierung wie v_claim_phase rt (updated_at desc, created_at desc).
    claimId
      ? admin.from('reparatur_termine').select('status').eq('claim_id', claimId)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
  ])

  const svAm = (svLedgerRes.data as { zahlungseingang_am: string | null } | null)?.zahlungseingang_am ?? null
  return {
    claim: claimRes.data
      ? ({ ...(claimRes.data as unknown as Record<string, unknown>), auszahlung_gutachter_eingegangen_am: svAm } as ClaimTriggers)
      : null,
    lead: (leadRes.data as LeadTriggers | null) ?? null,
    kanzleiFall,
    auftraege,
    gutachten: (gutachtenRes.data ?? []) as GutachtenTriggers[],
    gutachter_termine: (termineRes.data ?? []) as unknown as GutachterTerminRow[],
    webhook_events: (webhookRes.data ?? []) as unknown as WebhookEventRow[],
    reparatur_termine: (reparaturTerminRes.data ?? []) as { status?: string | null }[],
  }
}
