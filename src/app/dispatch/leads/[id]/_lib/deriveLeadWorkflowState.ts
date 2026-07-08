// Dispatch-Leads-Workflow-Rebuild (2026-07-07): der EINE abgeleitete Workflow-
// Zustand, der die zwei konkurrierenden Status-Systeme (leads.status +
// leads.qualifizierungs_phase) visuell ersetzt. Rein abgeleitet — schreibt
// nichts, aendert keine DB-Semantik. Konsumiert die kanonische Qualifizierungs-
// Engine (computeQualificationStatus) statt Qualifizierung neu abzuleiten.
//
// Design + State-Graph-Begruendung + Review-Entscheidungen D1/D2:
//   docs/superpowers/specs/2026-07-07-dispatch-leads-workflow-rebuild-design.md
//
// Kern-Erkenntnis: Q5 (SV-Termin reserviert/bestaetigt) ist eine der 8
// Qualifizierungs-Bedingungen -> canSendFlowLink erfordert einen SV-Termin ->
// die Zuweisung eines SV kommt zwingend VOR dem FlowLink-Versand.

import {
  computeQualificationStatus,
  type LeadLike,
  type AktiverTerminLike,
  type QualificationResult,
} from './qualification-engine'

/** Der abgeleitete Workflow-Zustand eines Leads (genau einer, Prioritaet first-match). */
export type LeadWorkflowState =
  | 'neu'
  | 'qualifizieren'
  | 'sv_zuweisen'
  | 'flowlink_senden'
  | 'nachfassen'
  | 'warten'
  | 'rueckruf'
  | 'terminal'

/** Lead-Felder die der Workflow-Zustand liest — LeadLike (fuer die Engine) + Workflow-spezifische. */
export type WorkflowLeadLike = LeadLike & {
  status?: string | null
  sa_unterschrieben?: boolean | null
  rueckruf_geplant_am?: string | null
  letzter_anruf_status?: string | null
  anruf_versuche?: number | null
}

/** Der (juengste) FlowLink des Leads — nur die zustandsrelevanten Timestamps. */
export type WorkflowFlowLink = {
  gesendet_am?: string | null
  geoeffnet_am?: string | null
  abgeschlossen_am?: string | null
  fall_id?: string | null
} | null

export type LeadWorkflowResult = {
  state: LeadWorkflowState
  /** Das durchgereichte QualificationResult der kanonischen Engine (fuer die UI: completedCount / fehlende Gates). */
  qual: QualificationResult
}

const TERMINAL_STATUS = new Set(['umgewandelt', 'umgewandelt-sv', 'disqualifiziert', 'kalt'])
const TERMINAL_PHASE = new Set(['konvertiert', 'abgeschlossen', 'kalt', 'disqualifiziert'])
const KONTAKT_PHASE = new Set([
  'erstkontakt',
  'in-qualifizierung',
  'gegner-daten',
  'flow-versendet',
  'sa-ausstehend',
])

/**
 * Leitet den EINEN Workflow-Zustand eines Leads ab (Prioritaet, first-match-wins).
 * Rein — kein I/O, kein Zeitbezug (Staleness ist Hero-Copy, nicht Zustand).
 * Reihenfolge + Begruendung: siehe Spec (D1/D2).
 */
export function deriveLeadWorkflowState(
  lead: WorkflowLeadLike,
  aktiverTermin: AktiverTerminLike,
  flowlink: WorkflowFlowLink,
): LeadWorkflowResult {
  const qual = computeQualificationStatus(lead, aktiverTermin)

  // 1. terminal — nichts mehr zu tun (konvertiert / disqualifiziert / kalt).
  if (
    lead.sa_unterschrieben === true ||
    flowlink?.fall_id != null ||
    flowlink?.abgeschlossen_am != null ||
    TERMINAL_STATUS.has(lead.status ?? '') ||
    qual.disqualifiziert ||
    TERMINAL_PHASE.has(lead.qualifizierungs_phase ?? '')
  ) {
    return { state: 'terminal', qual }
  }

  // 2. warten — Kunde hat den FlowLink geoeffnet, noch nicht abgeschlossen.
  if (flowlink != null && flowlink.geoeffnet_am != null && flowlink.abgeschlossen_am == null) {
    return { state: 'warten', qual }
  }

  // 3. nachfassen — FlowLink gesendet, aber (noch) nicht geoeffnet.
  if (flowlink != null && flowlink.gesendet_am != null && flowlink.geoeffnet_am == null) {
    return { state: 'nachfassen', qual }
  }

  // 4. rueckruf — Telefon-Track: geplanter Rueckruf ODER letzter Anruf nicht erreicht.
  //    (D1: erst nach den Late-Funnel-FlowLink-Zustaenden — ist ein Link offen, jage den Link.)
  if (lead.rueckruf_geplant_am != null || lead.letzter_anruf_status === 'nicht_erreicht') {
    return { state: 'rueckruf', qual }
  }

  // 5. flowlink_senden — alle 8 Gates (inkl. Q5-Termin) erfuellt, Link noch nicht raus.
  if (qual.canSendFlowLink && (flowlink == null || flowlink.gesendet_am == null)) {
    return { state: 'flowlink_senden', qual }
  }

  // 6. sv_zuweisen — einzige offene Luecke ist der SV-Termin (Q5).
  if (
    !qual.q5_svTermin &&
    qual.q1_schuldfrage &&
    qual.q2_schaden &&
    qual.q3_polizei &&
    qual.q4_schadentyp &&
    qual.q6_gegnerKz &&
    qual.q7_fahrzeug &&
    qual.q8_schadenhergang
  ) {
    return { state: 'sv_zuweisen', qual }
  }

  // 7. qualifizieren — Kontakt hergestellt, aber noch nicht SV-reif.
  //    "Fortschritt" = mind. ein BEDEUTSAMES Gate (q1-q4,q6,q7); q8 ist bei
  //    nicht-fahrbereiten/leeren Leads "frei" true, q5 ist der eigene Termin-
  //    Zustand -> beide zaehlen hier nicht als Qualifizierungs-Fortschritt.
  const hatQualiFortschritt =
    qual.q1_schuldfrage ||
    qual.q2_schaden ||
    qual.q3_polizei ||
    qual.q4_schadentyp ||
    qual.q6_gegnerKz ||
    qual.q7_fahrzeug
  const kontaktHergestellt =
    lead.letzter_anruf_status === 'erreicht' ||
    lead.status === 'quali-offen' ||
    KONTAKT_PHASE.has(lead.qualifizierungs_phase ?? '') ||
    hatQualiFortschritt
  if (kontaktHergestellt) {
    return { state: 'qualifizieren', qual }
  }

  // 8. neu — Default, noch kein Kontakt.
  return { state: 'neu', qual }
}
