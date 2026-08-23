// AAR-137 / W3: Dispatch-Lead-Detail Server-Component.
// P3b-Cutover (dispatch-config-unify): die Phasen-Maschinerie (DispatchShell /
// PhaseContent / _phases / qualification-engine-als-UI / initialPhase) ist
// entfernt — der flache, config-getriebene DispatchLeadForm (lead-erfassung,
// audience dispatcher/beide) ist jetzt der EINZIGE Pfad (kein ?v2-Gate mehr).
// Laedt Lead + SV-Termin + FlowLinks + Vorschaden-Merge und delegiert an den Form.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import DispatchLeadForm from './DispatchLeadForm'
import LeadRealtimeRefresh from '@/components/shared/LeadRealtimeRefresh'
import { ladeFlowPhasen } from '@/lib/onboarding/lade-flow-phasen'
import { computeQualificationStatus } from './_lib/qualification-engine'
import { ladeLeadTerminGutachter } from '@/lib/dispatch/lade-lead-termin-gutachter'
import LeadTerminGutachterBanner from './_components/LeadTerminGutachterBanner'
import { deriveLeadWorkflowState } from './_lib/deriveLeadWorkflowState'
import LeadWorkflowPanel from './_components/LeadWorkflowPanel'
import LeadNachrichtenPanel from './_components/LeadNachrichtenPanel'
import { getAlleSlots } from '@/lib/dokumente/katalog'
import { buildDokumentKontext } from '@/lib/dokumente/build-kontext'
import { evaluateKatalogRule } from '@/lib/dokumente/ruleEvaluator'

export default async function DispatchLeadDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) notFound()

  // AAR-956: Single-Source Termin + Gutachter (v_lead_termin_gutachter) fuers
  // Reconciliation-Banner — EINE Quelle ueber dispatch-/self-service-Termin +
  // Gutachter-Finder-Kundenwunsch, inkl. Divergenz-Warnung (gebucht != Wunsch).
  const terminGutachterMap = await ladeLeadTerminGutachter([id])
  const terminGutachterInfo = terminGutachterMap[id] ?? null

  // AAR-115 + AAR-134: aktiver SV-Termin fuer das termin-Override (SvDispatchPanel).
  // CMM-49 (sv_id-Drop): assignee_id+typ statt sv_id; der sachverstaendige-Embed lief
  // über die sv_id-FK (bricht beim DROP) → separater Lookup unten.
  const { data: svTerminRaw } = await supabase
    .from('gutachter_termine')
    .select('id, assignee_id, assignee_typ, start_zeit, end_zeit, status, sv_ablehnung_grund, sv_vorgeschlagene_slots')
    // AAR-956: Self-Service-Termine sind bezug-nativ (lead_id NULL) -> Dual-Lookup mitfinden
    // (sitzt auf #2644 assignee_id/assignee_typ auf — Profil-Lookup separat unten).
    .or(`lead_id.eq.${id},and(bezug_typ.eq.lead,bezug_id.eq.${id})`)
    .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgelehnt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const svTerminRow = svTerminRaw as {
    id: string
    assignee_id: string
    assignee_typ: string | null
    start_zeit: string
    end_zeit: string
    status: string
    sv_ablehnung_grund: string | null
    sv_vorgeschlagene_slots: { start: string; end: string }[] | null
  } | null
  // CMM-49: SV-Profil separat laden (assignee_id ist generisch, kein FK-Embed).
  let svProfile: { vorname: string | null; nachname: string | null } | null = null
  if (svTerminRow?.assignee_id && svTerminRow.assignee_typ === 'sachverstaendiger') {
    const { data: svRow } = await supabase
      .from('sachverstaendige')
      .select('profiles!sachverstaendige_profile_id_fkey(vorname, nachname)')
      .eq('id', svTerminRow.assignee_id)
      .maybeSingle()
    const profileRel = (svRow as { profiles: unknown } | null)?.profiles
    svProfile = (Array.isArray(profileRel) ? profileRel[0] : profileRel) as
      | { vorname: string | null; nachname: string | null }
      | null
  }
  const aktiverSvTermin = svTerminRow
    ? {
        id: svTerminRow.id,
        sv_id: svTerminRow.assignee_id,
        sv_vorname: svProfile?.vorname ?? null,
        sv_nachname: svProfile?.nachname ?? null,
        start_zeit: svTerminRow.start_zeit,
        end_zeit: svTerminRow.end_zeit,
        status: svTerminRow.status,
        sv_ablehnung_grund: svTerminRow.sv_ablehnung_grund,
        sv_vorgeschlagene_slots: svTerminRow.sv_vorgeschlagene_slots,
      }
    : null

  const qual = computeQualificationStatus(lead, aktiverSvTermin)

  // Config-getriebene Felder (lead-erfassung, vom Loader nach audience gefiltert).
  const phasen = await ladeFlowPhasen('lead-erfassung', 'dispatcher')

  // Pflichtdok-Kanonisierung (Task 7): freigeschaltete Slot-IDs aus dokument_katalog
  // berechnen, damit DokumenteAnfordernCard keine berechneErwartung-Fallback mehr braucht.
  // Nutzt denselben EvalContext wie alle anderen Katalog-Consumer.
  const katalogRows = await getAlleSlots(supabase)
  const dokCtx = buildDokumentKontext({ lead: lead as Record<string, unknown> })
  const freigeschalteteSlotIds = katalogRows
    .filter((slot) => evaluateKatalogRule(slot.freigeschaltet_wenn, dokCtx))
    .map((slot) => slot.slot_id)

  // Juengste FlowLinks fuers Versand- (P2g) + Status-Panel (P2h).
  // flow_links hat erstellt_am (nicht created_at) -> Alias auf created_at.
  // RLS: flow_links ist default-deny fuer authenticated — die Dispatch-Layer-Auth
  // (requirePortalAccess) prueft den Zugriff bereits; Admin-Client liest gezielt.
  const admin = createAdminClient()
  const { data: flowLinksRaw } = await admin
    .from('flow_links')
    .select('id, token, status, erstellt_am, expires_at, geoeffnet_am, abgeschlossen_am, fall_id, gesendet_am, gesendet_kanal, gesendet_anzahl')
    .eq('lead_id', id)
    .order('erstellt_am', { ascending: false })
    .limit(5)
  const flowLinks = (flowLinksRaw ?? []).map((fl) => ({
    id: fl.id as string,
    token: fl.token as string,
    status: fl.status as string,
    created_at: fl.erstellt_am as string,
    expires_at: fl.expires_at as string,
    geoeffnet_am: (fl.geoeffnet_am ?? null) as string | null,
    abgeschlossen_am: (fl.abgeschlossen_am ?? null) as string | null,
    fall_id: (fl.fall_id ?? null) as string | null,
    gesendet_am: (fl.gesendet_am ?? null) as string | null,
    gesendet_kanal: (fl.gesendet_kanal ?? null) as string | null,
    gesendet_anzahl: (fl.gesendet_anzahl ?? 0) as number,
  }))

  // AAR-631/653 + CMM-47: Vorschaden-Felder vom Fall (v_claim_full) ins lead-Objekt
  // mergen — Truth liegt nach der Konversion auf claims, nicht mehr auf leads, damit
  // die Fahrzeug-/Cardentity-Sektion die gewohnten Feldnamen liest. fallId fuers
  // SA-Konversions-Banner (nur wenn sa_unterschrieben → Form serverseitig edit-
  // gesperrt, AAR-631). v_claim_full mapped fall_id→id (PostgREST-Alias).
  const saUnterschrieben = !!lead.sa_unterschrieben
  let fallId: string | null = null
  const { data: fallRow } = await supabase
    .from('v_claim_full')
    .select(
      'id:fall_id, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, vorschaden_typ_b_bericht, cardentity_abfrage_am',
    )
    .eq('lead_id', id)
    .order('fall_created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (fallRow) {
    if (saUnterschrieben) fallId = (fallRow.id as string) ?? null
    lead.hat_vorschaeden = fallRow.hat_vorschaeden ?? lead.hat_vorschaeden ?? null
    lead.vorschaden_anzahl = fallRow.vorschaden_anzahl ?? null
    lead.vorschaden_letzter_datum = fallRow.vorschaden_letzter_datum ?? null
    lead.vorschaden_typ_b_bericht = fallRow.vorschaden_typ_b_bericht ?? null
    lead.cardentity_abfrage_am = fallRow.cardentity_abfrage_am ?? null
  }

  // Task 5c: aktuell zugewiesene Reparatur-Werkstatt fuers WerkstattVermittlungPanel.
  // reparatur_werkstatt_id steckt bereits im `lead` (select('*')), ist aber wegen
  // Type-Lag noch nicht typisiert -> Record-Cast. Name separat nachladen.
  const reparaturWerkstattId =
    ((lead as Record<string, unknown>).reparatur_werkstatt_id as string | null) ?? null
  let currentWerkstatt: { id: string; name: string } | null = null
  if (reparaturWerkstattId) {
    const { data: wRow } = await admin
      .from('werkstaetten')
      .select('id, name')
      .eq('id', reparaturWerkstattId)
      .maybeSingle()
    if (wRow) {
      currentWerkstatt = { id: wRow.id as string, name: (wRow.name as string | null) ?? 'Werkstatt' }
    }
  }

  // Phase 1b (additiv): der abgeleitete Workflow-Zustand als Kopfzone —
  // Zustands-Badge + Pipeline-Schiene + Next-Best-Action (guidanceOnly = noch
  // ohne CTA-Verdrahtung). DispatchLeadForm bleibt unveraendert darunter.
  const workflow = deriveLeadWorkflowState(lead, aktiverSvTermin, flowLinks[0] ?? null)

  return (
    <>
      <LeadRealtimeRefresh leadId={id} watchTermine />
      <LeadTerminGutachterBanner info={terminGutachterInfo} />
      <div className="mb-4">
        <LeadWorkflowPanel result={workflow} />
      </div>
      <DispatchLeadForm
        lead={lead as Record<string, unknown> & { id: string }}
        phasen={phasen}
        flowLinks={flowLinks}
        aktiverTermin={aktiverSvTermin}
        hardGateOk={qual.q1_schuldfrage && qual.q2_schaden && qual.q3_polizei}
        hardGateDetails={{ q1: qual.q1_schuldfrage, q2: qual.q2_schaden, q3: qual.q3_polizei }}
        wunschterminIso={(lead.wunschtermin as string | null) ?? null}
        wunschterminWochentage={
          Array.isArray(lead.wunschtermin_wochentage) && lead.wunschtermin_wochentage.length > 0
            ? (lead.wunschtermin_wochentage as number[])
            : null
        }
        fallId={fallId}
        freigeschalteteSlotIds={freigeschalteteSlotIds}
        currentWerkstatt={currentWerkstatt}
      />
      {/* Nachrichten des Interessenten — erster Leser von nachrichten.lead_id.
          Unterhalb des Formulars: die Nachricht ist Kontext fuer die Bearbeitung,
          kein eigener Arbeitsschritt. */}
      <div className="mt-4">
        <LeadNachrichtenPanel leadId={id} />
      </div>
    </>
  )
}
