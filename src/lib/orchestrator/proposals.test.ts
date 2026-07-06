import { describe, it, expect } from 'vitest'
import { dedupeKey } from './proposals'
import type { ProposalDraft } from './types'

const draft: ProposalDraft = { vorschlagTyp: 'task', zielRolle: 'kundenbetreuer', payload: { titel: 'Kunde anrufen' }, begruendung: 'x' }

describe('dedupeKey', () => {
  it('ist stabil für gleichen Inhalt', () => {
    expect(dedupeKey('c1', draft)).toBe(dedupeKey('c1', draft))
  })
  it('unterscheidet nach Claim, Typ, Rolle und Kern-Payload', () => {
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c2', draft))
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c1', { ...draft, zielRolle: 'admin' }))
    expect(dedupeKey('c1', draft)).not.toBe(dedupeKey('c1', { ...draft, payload: { titel: 'Anderer Task' } }))
  })
  it('ignoriert die Begründung (nur Aktion zählt)', () => {
    expect(dedupeKey('c1', draft)).toBe(dedupeKey('c1', { ...draft, begruendung: 'andere Begründung' }))
  })
})
