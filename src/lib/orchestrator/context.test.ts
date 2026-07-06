import { describe, it, expect } from 'vitest'
import { summarizeClaimForPrompt } from './context'
import type { ClaimContext } from './types'

const ctx: ClaimContext = {
  claimId: 'c1',
  fallId: 'f1',
  status: 'in_bearbeitung',
  phase: 'begutachtung',
  letzteAktivitaetAm: '2026-06-29T00:00:00Z',
  tageInaktiv: 6,
  fahrzeug: 'VW Golf',
  offeneTasks: [{ titel: 'Gutachten prüfen', rolle: 'kundenbetreuer', faelligAm: null }],
  kurzverlauf: ['Fall angelegt', 'SV zugewiesen'],
}

describe('summarizeClaimForPrompt', () => {
  it('enthält Phase, Inaktivität, offene Tasks und Verlauf', () => {
    const s = summarizeClaimForPrompt(ctx)
    expect(s).toContain('begutachtung')
    expect(s).toContain('6')
    expect(s).toContain('Gutachten prüfen')
    expect(s).toContain('SV zugewiesen')
  })
  it('kommt mit leeren Tasks/Verlauf klar', () => {
    const s = summarizeClaimForPrompt({ ...ctx, offeneTasks: [], kurzverlauf: [] })
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(0)
  })
})
