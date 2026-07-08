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
})
