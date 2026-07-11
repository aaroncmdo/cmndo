// src/lib/ops/derive-claim-workflow-state.ts
// Reine Ableitung: v_claim_workstate-Zeile -> ClaimWorkItem. Kein I/O, testbar.
import { toClaimMainPhase, toClaimSubPhase, type ClaimSubPhase } from '@/lib/claims/lifecycle'
import { CLAIM_WORKFLOW_META, CLAIM_SLA_DAYS } from './claim-workflow-meta'
import type { ClaimWorkItem, ClaimWorkstateRow } from './claim-workstate.types'

const MS_PER_DAY = 86_400_000

/** Terminale operative_status-Werte — Reparatur-Lane ueberspringen. */
const TERMINAL_OPERATIVE = new Set(['abgeschlossen', 'storniert', 'abgelehnt', 'verjaehrt'])

/** Abrechnungswege die eine Reparatur-Lane haben (kein Kanzlei-/Gutachten-Tail). */
const REPARATUR_ABRECHNUNGSWEGE = new Set(['selbstzahler', 'kasko'])

/** Bester verfuegbarer "seit wann in dieser Phase"-Zeitstempel (Heuristik, v_claim_full-Spalten). */
function phaseSince(row: ClaimWorkstateRow, sub: ClaimSubPhase): string | null {
  if (sub === 'anschlussschreiben') return row.anschlussschreiben_am ?? row.updated_at
  if (sub === 'gutachten' || sub === 'termin' || sub === 'besichtigung') return row.sv_zugewiesen_am ?? row.updated_at
  return row.updated_at ?? row.created_at
}

/** WS6 Slice 2a: Reparatur-Sub-Phase aus den reparatur_*-Spalten ableiten.
 *  Nur aufgerufen wenn abrechnungsweg IN (selbstzahler, kasko) + nicht terminal. */
function deriveRepairSubState(row: ClaimWorkstateRow): ClaimSubPhase {
  if (!row.reparatur_werkstatt_id) return 'reparatur_werkstattwahl'
  const rs = row.reparatur_status
  if (rs === 'bestaetigt') return 'reparatur_laeuft'
  if (rs === 'erledigt') return 'reparatur_fertig'
  // Termin abgelehnt/storniert -> Kunde muss neu waehlen
  if (rs === 'abgelehnt' || rs === 'storniert') return 'reparatur_werkstattwahl'
  // angefragt | anruf_erbeten | null -> Terminfindung
  return 'reparatur_terminfindung'
}

export function deriveClaimWorkflowState(row: ClaimWorkstateRow, now: Date = new Date()): ClaimWorkItem {
  // ── WS6 Slice 2a: Reparatur-Lane EARLY (vor normalem Mapping) ──────────────
  // Bedingung: abrechnungsweg IN (selbstzahler, kasko) UND operative_status ist
  // nicht terminal (abgeschlossen/storniert/abgelehnt/verjaehrt). Terminal-Claims
  // fallen durch zum normalen Mapping.
  if (
    row.abrechnungsweg != null &&
    REPARATUR_ABRECHNUNGSWEGE.has(row.abrechnungsweg) &&
    !TERMINAL_OPERATIVE.has(row.operative_status ?? '')
  ) {
    const subState = deriveRepairSubState(row)
    const meta = CLAIM_WORKFLOW_META[subState]
    const sla = CLAIM_SLA_DAYS[subState]
    const since = row.updated_at ?? row.created_at
    let overdueSinceDays: number | null = null
    let isOverdue = false
    if (sla != null && since) {
      const days = Math.floor((now.getTime() - new Date(since).getTime()) / MS_PER_DAY)
      overdueSinceDays = days
      isOverdue = days > sla
    }
    // stage = SQL-konsistente main_phase aus dem Row (wie der normale Pfad, Z.90).
    // Reparatur-Claims haben in v_claim_workstate.main_phase stets die
    // operative_status-abgeleitete Phase (z.B. ersterfassung -> erfassung).
    // Wir weichen NICHT davon ab, damit Cockpit-Count (SQL) und Drill-In (TS) uebereinstimmen.
    const stage = toClaimMainPhase(row.main_phase)
    return {
      kind: 'claim',
      id: row.claim_id,
      fallId: row.fall_id,
      kundenbetreuerId: row.kundenbetreuer_id,
      claimNummer: row.claim_nummer,
      stage,
      subState,
      nextActionCode: meta.nextActionCode,
      ownerRole: meta.ownerRole,
      waitingOn: meta.waitingOn,
      isOverdue,
      overdueSinceDays,
      display: {
        title: row.kunde_name ?? row.claim_nummer ?? row.claim_id,
        kennzeichen: row.kennzeichen,
        schadenhoehe: row.schadenhoehe,
      },
      editable: {
        notizen: row.edit_notizen,
        interneNotizen: row.edit_interne_notizen,
        schadensHoeheNetto: row.edit_schadens_hoehe_netto,
      },
    }
  }

  // ── Normales Mapping (alle anderen Claims) ──────────────────────────────────
  const stage = toClaimMainPhase(row.main_phase)
  const subState = toClaimSubPhase(row.sub_phase)
  const meta = CLAIM_WORKFLOW_META[subState]

  const sla = CLAIM_SLA_DAYS[subState]
  const since = phaseSince(row, subState)
  let overdueSinceDays: number | null = null
  let isOverdue = false
  if (sla != null && since) {
    const days = Math.floor((now.getTime() - new Date(since).getTime()) / MS_PER_DAY)
    overdueSinceDays = days
    isOverdue = days > sla
  }

  return {
    kind: 'claim',
    id: row.claim_id,
    fallId: row.fall_id,
    kundenbetreuerId: row.kundenbetreuer_id,
    claimNummer: row.claim_nummer,
    stage,
    subState,
    nextActionCode: meta.nextActionCode,
    ownerRole: meta.ownerRole,
    waitingOn: meta.waitingOn,
    isOverdue,
    overdueSinceDays,
    display: {
      title: row.kunde_name ?? row.claim_nummer ?? row.claim_id,
      kennzeichen: row.kennzeichen,
      schadenhoehe: row.schadenhoehe,
    },
    editable: {
      notizen: row.edit_notizen,
      interneNotizen: row.edit_interne_notizen,
      schadensHoeheNetto: row.edit_schadens_hoehe_netto,
    },
  }
}
