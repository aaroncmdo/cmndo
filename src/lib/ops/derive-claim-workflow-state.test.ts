// src/lib/ops/derive-claim-workflow-state.test.ts
import { describe, it, expect } from 'vitest'
import { deriveClaimWorkflowState } from './derive-claim-workflow-state'
import type { ClaimWorkstateRow } from './claim-workstate.types'

const base: ClaimWorkstateRow = {
  claim_id: 'c1', claim_nummer: 'CLM-1', lead_id: null, kundenbetreuer_id: 'kb1', sv_id: null,
  main_phase: 'begutachtung', sub_phase: 'gutachten', status: 'in_bearbeitung', operative_status: null,
  ist_aktiv: true, kennzeichen: 'K-AB 1', kunde_name: 'Müller', schadenhoehe: 4500,
  sa_unterschrieben: true, sv_zugewiesen_am: '2026-06-01T00:00:00Z', gutachten_eingegangen_am: null,
  anschlussschreiben_am: null, regulierung_am: null, abgeschlossen_am: null, storniert_am: null,
  updated_at: '2026-06-01T00:00:00Z', created_at: '2026-05-20T00:00:00Z',
  dokumente_vollstaendig_fuer_phase: null, vs_eskalationsstufe: null,
  fall_id: 'f1',
  edit_notizen: 'hallo', edit_interne_notizen: null, edit_schadens_hoehe_netto: 4500,
  abrechnungsweg: null, reparatur_werkstatt_id: null, reparatur_status: null, reparatur_erledigt_am: null,
}
const NOW = new Date('2026-06-15T00:00:00Z')

describe('deriveClaimWorkflowState', () => {
  it('mappt sub_phase auf nextActionCode/owner via meta', () => {
    const wi = deriveClaimWorkflowState(base, NOW)
    expect(wi.kind).toBe('claim')
    expect(wi.stage).toBe('begutachtung')
    expect(wi.subState).toBe('gutachten')
    expect(wi.nextActionCode).toBe('gutachten_ausstehend')
    expect(wi.ownerRole).toBe('sv')
    expect(wi.waitingOn).toBe('sv')
  })
  it('markiert ueberfaellig, wenn phase_since > SLA', () => {
    // gutachten SLA=7d; sv_zugewiesen_am 2026-06-01, NOW 2026-06-15 => 14d > 7 => overdue
    const wi = deriveClaimWorkflowState(base, NOW)
    expect(wi.isOverdue).toBe(true)
    expect(wi.overdueSinceDays).toBeGreaterThanOrEqual(14)
  })
  it('ist nicht ueberfaellig innerhalb der SLA', () => {
    const wi = deriveClaimWorkflowState({ ...base, sv_zugewiesen_am: '2026-06-13T00:00:00Z' }, NOW)
    expect(wi.isOverdue).toBe(false)
  })
  it('Terminal-Phase = abgeschlossen, kein overdue', () => {
    const wi = deriveClaimWorkflowState({ ...base, main_phase: 'abschluss', sub_phase: 'erfolgreich_reguliert' }, NOW)
    expect(wi.nextActionCode).toBe('abgeschlossen')
    expect(wi.isOverdue).toBe(false)
  })
  it('display.title faellt auf claim_nummer zurueck, wenn kein Name', () => {
    const wi = deriveClaimWorkflowState({ ...base, kunde_name: null }, NOW)
    expect(wi.display.title).toBe('CLM-1')
  })
  it('surfaced fallId from the row', () => {
    expect(deriveClaimWorkflowState(base, NOW).fallId).toBe('f1')
  })
  it('fallId ist null wenn die Zeile kein fall_id hat', () => {
    expect(deriveClaimWorkflowState({ ...base, fall_id: null }, NOW).fallId).toBeNull()
  })
  it('surfaced editable fields (aktuelle Werte fuer den Hover)', () => {
    const wi = deriveClaimWorkflowState(base, NOW)
    expect(wi.editable).toEqual({ notizen: 'hallo', interneNotizen: null, schadensHoeheNetto: 4500 })
  })
  it('surfaced kundenbetreuerId from the row (Admin-Cockpit-Gruppierung)', () => {
    expect(deriveClaimWorkflowState(base, NOW).kundenbetreuerId).toBe('kb1')
    expect(deriveClaimWorkflowState({ ...base, kundenbetreuer_id: null }, NOW).kundenbetreuerId).toBeNull()
  })

  // ── WS6 Slice 2a: Reparatur-Lane ─────────────────────────────────────────
  const repairBase: ClaimWorkstateRow = {
    ...base,
    abrechnungsweg: 'selbstzahler',
    operative_status: 'ersterfassung',
    main_phase: 'erfassung',
    sub_phase: 'sa_offen',
  }

  it('Selbstzahler ohne Werkstatt => reparatur_werkstattwahl, erfassung, waitingOn:kunde, ownerRole:none', () => {
    const wi = deriveClaimWorkflowState({ ...repairBase, reparatur_werkstatt_id: null }, NOW)
    expect(wi.subState).toBe('reparatur_werkstattwahl')
    expect(wi.stage).toBe('erfassung')
    expect(wi.ownerRole).toBe('none')
    expect(wi.waitingOn).toBe('kunde')
    expect(wi.nextActionCode).toBe('werkstatt_waehlen')
  })

  it('Selbstzahler Werkstatt gesetzt + status angefragt => reparatur_terminfindung, erfassung, waitingOn:none', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, reparatur_werkstatt_id: 'ws1', reparatur_status: 'angefragt' },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_terminfindung')
    expect(wi.stage).toBe('erfassung')
    expect(wi.ownerRole).toBe('none')
    expect(wi.waitingOn).toBe('none')
  })

  it('Selbstzahler Werkstatt gesetzt + status anruf_erbeten => reparatur_terminfindung', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, reparatur_werkstatt_id: 'ws1', reparatur_status: 'anruf_erbeten' },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_terminfindung')
  })

  it('Selbstzahler reparatur_status=bestaetigt => reparatur_laeuft, stage=erfassung (SQL-konsistent), ownerRole:none, waitingOn:none', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, reparatur_werkstatt_id: 'ws1', reparatur_status: 'bestaetigt' },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_laeuft')
    // stage == SQL main_phase (row.main_phase='erfassung' fuer nicht-terminal-Claim)
    expect(wi.stage).toBe('erfassung')
    expect(wi.ownerRole).toBe('none')
    expect(wi.waitingOn).toBe('none')
    expect(wi.nextActionCode).toBe('reparatur_laeuft')
  })

  it('Selbstzahler reparatur_status=erledigt (nicht terminal) => reparatur_fertig, stage=erfassung (SQL-konsistent), ownerRole:intern', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, reparatur_werkstatt_id: 'ws1', reparatur_status: 'erledigt' },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_fertig')
    // stage bleibt erfassung — der Reconciliation-Lens der Ops-Ansicht flaggt erledigt-but-not-closed
    expect(wi.stage).toBe('erfassung')
    expect(wi.ownerRole).toBe('intern')
    expect(wi.waitingOn).toBe('intern')
    expect(wi.nextActionCode).toBe('reparatur_abschliessen')
  })

  it('Selbstzahler reparatur_status=abgelehnt => reparatur_werkstattwahl (Termin gescheitert, Kunde neu waehlen)', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, reparatur_werkstatt_id: 'ws1', reparatur_status: 'abgelehnt' },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_werkstattwahl')
    expect(wi.stage).toBe('erfassung')
    expect(wi.ownerRole).toBe('none')
    expect(wi.waitingOn).toBe('kunde')
  })

  it('Selbstzahler reparatur_status=storniert => reparatur_werkstattwahl (analog abgelehnt)', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, reparatur_werkstatt_id: 'ws1', reparatur_status: 'storniert' },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_werkstattwahl')
    expect(wi.stage).toBe('erfassung')
  })

  it('Kasko-Claim folgt ebenfalls der Reparatur-Lane', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, abrechnungsweg: 'kasko', reparatur_werkstatt_id: null },
      NOW,
    )
    expect(wi.subState).toBe('reparatur_werkstattwahl')
    expect(wi.ownerRole).toBe('none')
  })

  it('Terminal-Selbstzahler (operative_status=abgeschlossen) faellt durch zur normalen Logik — kein ownerRole:kb-Bug', () => {
    const wi = deriveClaimWorkflowState(
      { ...repairBase, operative_status: 'abgeschlossen', main_phase: 'abschluss', sub_phase: 'erfolgreich_reguliert' },
      NOW,
    )
    // Faellt durch: Normal-Mapping -> erfolgreich_reguliert, ownerRole:none (NICHT kb)
    expect(wi.subState).toBe('erfolgreich_reguliert')
    expect(wi.ownerRole).toBe('none')
  })

  // ── Regression: Haftpflicht-Claims duerfen NICHT in die Reparatur-Lane ──
  it('Haftpflicht-Claim (abrechnungsweg=haftpflicht) bleibt im normalen Mapping', () => {
    const wi = deriveClaimWorkflowState(
      {
        ...base,
        abrechnungsweg: 'haftpflicht',
        operative_status: 'ersterfassung',
        main_phase: 'erfassung',
        sub_phase: 'sa_offen',
        reparatur_werkstatt_id: null,
      },
      NOW,
    )
    // Normales Mapping: sa_offen -> ownerRole:kb, waitingOn:kunde
    expect(wi.subState).toBe('sa_offen')
    expect(wi.ownerRole).toBe('kb')
    expect(wi.nextActionCode).toBe('sa_anfordern')
  })

  it('Claim ohne abrechnungsweg (null) bleibt im normalen Mapping', () => {
    const wi = deriveClaimWorkflowState(
      { ...base, abrechnungsweg: null },
      NOW,
    )
    expect(wi.subState).toBe('gutachten')
    expect(wi.ownerRole).toBe('sv')
  })
})
