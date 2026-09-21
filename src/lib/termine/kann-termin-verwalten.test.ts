import { describe, it, expect } from 'vitest'
import { istKundeOwner } from './kann-termin-verwalten'

describe('istKundeOwner', () => {
  it('true wenn kunde_id === userId', () => {
    expect(istKundeOwner({ kunde_id: 'u1', lead_email: null }, { id: 'u1', email: 'a@b.de' })).toBe(true)
  })
  it('true wenn lead_email === user.email (case-insensitive)', () => {
    expect(istKundeOwner({ kunde_id: null, lead_email: 'A@B.de' }, { id: 'u1', email: 'a@b.de' })).toBe(true)
  })
  it('false sonst', () => {
    expect(istKundeOwner({ kunde_id: 'x', lead_email: 'z@z.de' }, { id: 'u1', email: 'a@b.de' })).toBe(false)
  })
  it('false wenn user.email null und kein kunde_id-Match', () => {
    expect(istKundeOwner({ kunde_id: 'x', lead_email: 'z@z.de' }, { id: 'u1', email: null })).toBe(false)
  })
  it('Stufe 2: false wenn lead_email UND user.email null (keine Wildcard)', () => {
    expect(istKundeOwner({ kunde_id: null, lead_email: null }, { id: 'u1', email: null, phone: null })).toBe(false)
  })
  it('Stufe 2: true wenn Lead-Telefon-Suffix === user.phone', () => {
    expect(istKundeOwner({ kunde_id: null, lead_email: null, lead_telefon: '0151 7842 9156' }, { id: 'u1', email: null, phone: '4915178429156' })).toBe(true)
  })
  it('Stufe 2: false wenn Lead-Telefon anders', () => {
    expect(istKundeOwner({ kunde_id: null, lead_email: null, lead_telefon: '0151 7842 9157' }, { id: 'u1', email: null, phone: '4915178429156' })).toBe(false)
  })
})
