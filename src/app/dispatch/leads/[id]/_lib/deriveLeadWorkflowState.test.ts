import { describe, it, expect } from 'vitest'
import { deriveLeadWorkflowState } from './deriveLeadWorkflowState'
import type { WorkflowLeadLike, WorkflowFlowLink } from './deriveLeadWorkflowState'
import type { AktiverTerminLike } from './qualification-engine'

// --- Fixtures ---

/** Ein völlig frischer Lead: kein Kontakt, keine Quali-Daten. */
function bareLead(overrides: Partial<WorkflowLeadLike> = {}): WorkflowLeadLike {
  return { status: 'neu', qualifizierungs_phase: 'neu', ...overrides }
}

/** Ein Lead der ALLE Nicht-Termin-Gates (Q1–Q4, Q6–Q8) erfüllt. Q5 haengt am Termin. */
function svReadyLead(overrides: Partial<WorkflowLeadLike> = {}): WorkflowLeadLike {
  return {
    status: 'quali-offen',
    qualifizierungs_phase: 'in-qualifizierung',
    unfallhergang: 'Gegner ist mir hinten reingefahren an der Ampel, klarer Fall.',
    schuldfrage: 'gegner',
    schaden_sichtbar: true,
    polizei_vor_ort: false,
    schadentyp: 'heckschaden',
    gegner_kennzeichen: 'B-XX-1234',
    kennzeichen: 'M-AB-100',
    fahrzeug_hersteller: 'VW',
    fahrzeug_modell: 'Golf',
    fahrzeug_fahrbereit: false,
    ...overrides,
  }
}

const reservierterTermin: AktiverTerminLike = { status: 'reserviert' }

// --- neu ---

describe('deriveLeadWorkflowState — neu', () => {
  it('frischer Lead ohne Kontakt/Termin/FlowLink → neu', () => {
    const { state } = deriveLeadWorkflowState(bareLead(), null, null)
    expect(state).toBe('neu')
  })
})

// --- qualifizieren ---

describe('deriveLeadWorkflowState — qualifizieren', () => {
  it('in-qualifizierung mit etwas Quali-Fortschritt, kein Termin → qualifizieren', () => {
    const lead = bareLead({
      qualifizierungs_phase: 'in-qualifizierung',
      unfallhergang: 'kurz',
      schuldfrage: 'gegner', // Q1 erfüllt → completedCount > 0
    })
    const { state } = deriveLeadWorkflowState(lead, null, null)
    expect(state).toBe('qualifizieren')
  })

  it('telefonisch erreicht (letzter_anruf_status=erreicht), noch keine Quali → qualifizieren', () => {
    const lead = bareLead({ letzter_anruf_status: 'erreicht' })
    const { state } = deriveLeadWorkflowState(lead, null, null)
    expect(state).toBe('qualifizieren')
  })
})

// --- sv_zuweisen ---

describe('deriveLeadWorkflowState — sv_zuweisen', () => {
  it('alle Gates ausser Q5 (kein Termin) → sv_zuweisen', () => {
    const { state, qual } = deriveLeadWorkflowState(svReadyLead(), null, null)
    expect(state).toBe('sv_zuweisen')
    expect(qual.q5_svTermin).toBe(false)
    expect(qual.canSendFlowLink).toBe(false)
  })

  it('abgelehnter Termin zaehlt nicht als Q5 → sv_zuweisen', () => {
    const { state } = deriveLeadWorkflowState(svReadyLead(), { status: 'abgelehnt' }, null)
    expect(state).toBe('sv_zuweisen')
  })
})

// --- flowlink_senden ---

describe('deriveLeadWorkflowState — flowlink_senden', () => {
  it('voll qualifiziert (inkl. reservierter Termin), kein FlowLink → flowlink_senden', () => {
    const { state, qual } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, null)
    expect(state).toBe('flowlink_senden')
    expect(qual.canSendFlowLink).toBe(true)
  })

  it('voll qualifiziert, FlowLink existiert aber nie gesendet → flowlink_senden', () => {
    const fl: WorkflowFlowLink = { gesendet_am: null, geoeffnet_am: null, abgeschlossen_am: null, fall_id: null }
    const { state } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, fl)
    expect(state).toBe('flowlink_senden')
  })
})

// --- nachfassen ---

describe('deriveLeadWorkflowState — nachfassen', () => {
  it('FlowLink gesendet, nicht geoeffnet → nachfassen', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: null, abgeschlossen_am: null, fall_id: null }
    const { state } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, fl)
    expect(state).toBe('nachfassen')
  })
})

// --- warten ---

describe('deriveLeadWorkflowState — warten', () => {
  it('FlowLink geoeffnet, noch nicht abgeschlossen → warten', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: '2026-07-02T09:00:00Z', abgeschlossen_am: null, fall_id: null }
    const { state } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, fl)
    expect(state).toBe('warten')
  })
})

// --- rueckruf ---

describe('deriveLeadWorkflowState — rueckruf', () => {
  it('geplanter Rueckruf (rueckruf_geplant_am), kein FlowLink → rueckruf', () => {
    const lead = bareLead({ rueckruf_geplant_am: '2026-07-08T14:00:00Z' })
    const { state } = deriveLeadWorkflowState(lead, null, null)
    expect(state).toBe('rueckruf')
  })

  it('nicht erreicht, kein FlowLink → rueckruf', () => {
    const lead = bareLead({ letzter_anruf_status: 'nicht_erreicht', anruf_versuche: 2 })
    const { state } = deriveLeadWorkflowState(lead, null, null)
    expect(state).toBe('rueckruf')
  })
})

// --- terminal ---

describe('deriveLeadWorkflowState — terminal', () => {
  it('sa_unterschrieben → terminal', () => {
    const { state } = deriveLeadWorkflowState(svReadyLead({ sa_unterschrieben: true }), reservierterTermin, null)
    expect(state).toBe('terminal')
  })

  it('FlowLink zu Fall konvertiert (fall_id) → terminal', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: '2026-07-02T09:00:00Z', abgeschlossen_am: '2026-07-03T12:00:00Z', fall_id: 'fall-123' }
    const { state } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, fl)
    expect(state).toBe('terminal')
  })

  it('FlowLink abgeschlossen (SA abgeschickt) → terminal', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: '2026-07-02T09:00:00Z', abgeschlossen_am: '2026-07-03T12:00:00Z', fall_id: null }
    const { state } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, fl)
    expect(state).toBe('terminal')
  })

  it('status=umgewandelt-sv → terminal', () => {
    const { state } = deriveLeadWorkflowState(bareLead({ status: 'umgewandelt-sv' }), null, null)
    expect(state).toBe('terminal')
  })

  it('disqualifiziert=true → terminal', () => {
    const { state } = deriveLeadWorkflowState(svReadyLead({ disqualifiziert: true }), reservierterTermin, null)
    expect(state).toBe('terminal')
  })

  it('status=kalt → terminal', () => {
    const { state } = deriveLeadWorkflowState(bareLead({ status: 'kalt', qualifizierungs_phase: 'kalt' }), null, null)
    expect(state).toBe('terminal')
  })
})

// --- Prioritaets-Kollisionen ---

describe('deriveLeadWorkflowState — Prioritaet', () => {
  it('terminal schlaegt warten: sa_unterschrieben + FlowLink geoeffnet → terminal', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: '2026-07-02T09:00:00Z', abgeschlossen_am: null, fall_id: null }
    const { state } = deriveLeadWorkflowState(svReadyLead({ sa_unterschrieben: true }), reservierterTermin, fl)
    expect(state).toBe('terminal')
  })

  it('warten schlaegt rueckruf: FlowLink geoeffnet + nicht_erreicht → warten', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: '2026-07-02T09:00:00Z', abgeschlossen_am: null, fall_id: null }
    const lead = svReadyLead({ letzter_anruf_status: 'nicht_erreicht' })
    const { state } = deriveLeadWorkflowState(lead, reservierterTermin, fl)
    expect(state).toBe('warten')
  })

  it('warten schlaegt nachfassen: geoeffnet gewinnt gegen nur-gesendet', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: '2026-07-02T09:00:00Z', abgeschlossen_am: null, fall_id: null }
    const { state } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, fl)
    expect(state).toBe('warten')
  })

  it('D1: nachfassen schlaegt rueckruf (Link jagen statt Telefon): gesendet-nicht-geoeffnet + geplanter Rueckruf → nachfassen', () => {
    const fl: WorkflowFlowLink = { gesendet_am: '2026-07-01T10:00:00Z', geoeffnet_am: null, abgeschlossen_am: null, fall_id: null }
    const lead = svReadyLead({ rueckruf_geplant_am: '2026-07-08T14:00:00Z' })
    const { state } = deriveLeadWorkflowState(lead, reservierterTermin, fl)
    expect(state).toBe('nachfassen')
  })

  it('rueckruf schlaegt qualifizieren: in-qualifizierung + nicht_erreicht, kein FlowLink → rueckruf', () => {
    const lead = svReadyLead({ letzter_anruf_status: 'nicht_erreicht' })
    // svReadyLead ist SV-reif → ohne den rueckruf-Zweig waere es sv_zuweisen;
    // rueckruf (Telefon-Blocker) hat Vorrang vor sv_zuweisen/qualifizieren.
    const { state } = deriveLeadWorkflowState(lead, null, null)
    expect(state).toBe('rueckruf')
  })
})

// --- qual wird durchgereicht (Reuse-Beleg) ---

describe('deriveLeadWorkflowState — qual-Durchreichung', () => {
  it('gibt das QualificationResult der kanonischen Engine zurueck', () => {
    const { qual } = deriveLeadWorkflowState(svReadyLead(), reservierterTermin, null)
    expect(qual.completedCount).toBe(8)
    expect(qual.allComplete).toBe(true)
  })
})
