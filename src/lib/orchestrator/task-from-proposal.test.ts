import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapProposalToTaskParams, PRIO_MAP } from './task-from-proposal'
import type { TaskProposalPayload } from './types'

describe('mapProposalToTaskParams', () => {
  const NOW = 1720310400000 // fixed epoch for deterministic Date assertions
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('(a) volles payload → korrekte Params', () => {
    const payload: TaskProposalPayload = {
      titel: 'Gutachten anfordern',
      beschreibung: 'Bitte SV kontaktieren',
      prioritaet: 'hoch',
      faellig_in_tagen: 3,
    }
    const result = mapProposalToTaskParams(payload, 'sachverstaendiger', 'claim-123', 'ai_orchestrator_vorschlag')
    expect(result.titel).toBe('Gutachten anfordern')
    expect(result.beschreibung).toBe('Bitte SV kontaktieren')
    expect(result.prioritaet).toBe('dringend') // hoch → dringend
    expect(result.empfaenger_rolle).toBe('sachverstaendiger')
    expect(result.fall_id).toBe('claim-123')
    expect(result.trigger_event).toBe('ai_orchestrator_vorschlag')
    // faellig_am = NOW + 3 * 86400000
    expect(result.faellig_am).toBeInstanceOf(Date)
    expect(result.faellig_am!.getTime()).toBe(NOW + 3 * 86400000)
  })

  it('(b) leeres payload → titel=AI-Vorschlag, prioritaet undefined, faellig_am undefined', () => {
    const payload: TaskProposalPayload = {}
    const result = mapProposalToTaskParams(payload, 'admin', 'claim-456', 'ai_orchestrator_vorschlag')
    expect(result.titel).toBe('AI-Vorschlag')
    expect(result.prioritaet).toBeUndefined()
    expect(result.faellig_am).toBeUndefined()
  })

  it('(c) zielRolle null → empfaenger_rolle undefined', () => {
    const payload: TaskProposalPayload = { titel: 'Test' }
    const result = mapProposalToTaskParams(payload, null, 'claim-789', 'ai_orchestrator_vorschlag')
    expect(result.empfaenger_rolle).toBeUndefined()
  })

  it('PRIO_MAP: niedrig → normal', () => {
    expect(PRIO_MAP['niedrig']).toBe('normal')
  })
  it('PRIO_MAP: normal → normal', () => {
    expect(PRIO_MAP['normal']).toBe('normal')
  })
  it('PRIO_MAP: hoch → dringend', () => {
    expect(PRIO_MAP['hoch']).toBe('dringend')
  })
  it('PRIO_MAP: dringend → dringend', () => {
    expect(PRIO_MAP['dringend']).toBe('dringend')
  })
  it('PRIO_MAP: kritisch → kritisch', () => {
    expect(PRIO_MAP['kritisch']).toBe('kritisch')
  })
})
