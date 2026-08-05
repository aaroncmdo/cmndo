import { describe, it, expect } from 'vitest'
import { initialOperativeStatus } from '../initial-operative-status'

describe('initialOperativeStatus', () => {
  const base = { gutachtenBereitsErstellt: false, svIdFromTermin: null, hatOffenenTermin: false }
  it('Gutachten liegt vor → gutachten-eingegangen', () =>
    expect(initialOperativeStatus({ ...base, gutachtenBereitsErstellt: true })).toBe('gutachten-eingegangen'))
  it('echter SV am Termin → sv-termin', () =>
    expect(initialOperativeStatus({ ...base, svIdFromTermin: 'sv-1' })).toBe('sv-termin'))
  it('offener Termin ohne SV (Dead-Pin/Wunsch) → sv-gesucht', () =>
    expect(initialOperativeStatus({ ...base, hatOffenenTermin: true })).toBe('sv-gesucht'))
  it('nichts → ersterfassung', () => expect(initialOperativeStatus(base)).toBe('ersterfassung'))
  it('Gutachten schlaegt alles', () =>
    expect(initialOperativeStatus({ gutachtenBereitsErstellt: true, svIdFromTermin: 'sv-1', hatOffenenTermin: true })).toBe('gutachten-eingegangen'))
})
