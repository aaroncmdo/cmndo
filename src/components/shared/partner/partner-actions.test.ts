import { describe, it, expect } from 'vitest'
import { aktionenFuer, PARTNER_ACTIONS, AKTION_LABEL } from './partner-actions'

describe('PARTNER_ACTIONS', () => {
  it('every partner type has the four CRM actions', () => {
    for (const typ of ['sv', 'makler', 'werkstatt', 'flotte'] as const) {
      for (const crm of ['notiz', 'anruf', 'email', 'einstufung'] as const) {
        expect(aktionenFuer(typ)).toContain(crm)
      }
    }
  })
  it('only SV+Werkstatt get verifizieren; only SV gets freischalten', () => {
    expect(aktionenFuer('sv')).toContain('verifizieren')
    expect(aktionenFuer('werkstatt')).toContain('verifizieren')
    expect(aktionenFuer('makler')).not.toContain('verifizieren')
    expect(aktionenFuer('flotte')).not.toContain('verifizieren')
    expect(aktionenFuer('sv')).toContain('freischalten')
    expect(aktionenFuer('werkstatt')).not.toContain('freischalten')
  })
  it('only Flotte gets deeplinks', () => {
    expect(aktionenFuer('flotte')).toContain('deeplinks')
    expect(aktionenFuer('sv')).not.toContain('deeplinks')
  })
  it('every action key has a German label', () => {
    for (const keys of Object.values(PARTNER_ACTIONS)) {
      for (const k of keys) expect(AKTION_LABEL[k]).toBeTruthy()
    }
  })
})
