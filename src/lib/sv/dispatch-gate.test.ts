import { describe, it, expect } from 'vitest'
import { svDarfFaelleEmpfangen, FRIST_UEBERSCHRITTEN, type SvDispatchGateFields } from './dispatch-gate'

const good: SvDispatchGateFields = {
  verifiziert: true,
  ist_aktiv: true,
  portal_zugang_freigeschaltet: true,
  ist_testaccount: false,
  gesperrt_seit: null,
  geloescht_am: null,
  verifizierung_status: 'geprueft',
}

describe('svDarfFaelleEmpfangen', () => {
  it('true when all dispatch clauses pass', () => {
    expect(svDarfFaelleEmpfangen(good)).toBe(true)
  })
  it('false when not verified', () => {
    expect(svDarfFaelleEmpfangen({ ...good, verifiziert: false })).toBe(false)
    expect(svDarfFaelleEmpfangen({ ...good, verifiziert: null })).toBe(false)
  })
  it('false when not active', () => {
    expect(svDarfFaelleEmpfangen({ ...good, ist_aktiv: false })).toBe(false)
  })
  it('false when portal not unlocked', () => {
    expect(svDarfFaelleEmpfangen({ ...good, portal_zugang_freigeschaltet: false })).toBe(false)
  })
  it('false for test accounts (mirrors .eq(ist_testaccount,false): only false passes)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, ist_testaccount: true })).toBe(false)
    expect(svDarfFaelleEmpfangen({ ...good, ist_testaccount: null })).toBe(false)
  })
  it('false when admin-blocked (gesperrt_seit set)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, gesperrt_seit: '2026-07-01T00:00:00Z' })).toBe(false)
  })
  it('false when soft-deleted (geloescht_am set)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, geloescht_am: '2026-07-01T00:00:00Z' })).toBe(false)
  })
  it('false for null / undefined input', () => {
    expect(svDarfFaelleEmpfangen(null)).toBe(false)
    expect(svDarfFaelleEmpfangen(undefined)).toBe(false)
  })
  // DECISION FG3-Task-3.0 (Aaron 2026-07-11): ENFORCE. Do NOT flip without re-recording the decision.
  it('false when verifizierung_status = frist_ueberschritten [decision A: ENFORCE]', () => {
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: FRIST_UEBERSCHRITTEN })).toBe(false)
  })
  it('true for ausstehend / null status (only frist_ueberschritten blocks; NULL-safe)', () => {
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: 'ausstehend' })).toBe(true)
    expect(svDarfFaelleEmpfangen({ ...good, verifizierung_status: null })).toBe(true)
  })
})
