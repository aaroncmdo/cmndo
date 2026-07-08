import { describe, it, expect } from 'vitest'
import { summarizeClaimForPrompt, proposalHaupttext } from './context'
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
  bereitsVorgeschlagen: [],
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
  it('rendert die Sektion „Bereits vorgeschlagen" wenn Verlauf existiert', () => {
    const s = summarizeClaimForPrompt({
      ...ctx,
      bereitsVorgeschlagen: [
        { typ: 'task', haupttext: 'Kunde anrufen', status: 'verworfen', feedback: 'schon erledigt' },
      ],
    })
    expect(s).toContain('Bereits vorgeschlagen')
    expect(s).toContain('Kunde anrufen')
    expect(s).toContain('verworfen')
    expect(s).toContain('schon erledigt')
  })
  it('lässt die Sektion weg wenn kein Verlauf', () => {
    const s = summarizeClaimForPrompt({ ...ctx, bereitsVorgeschlagen: [] })
    expect(s).not.toContain('Bereits vorgeschlagen')
  })
})

describe('proposalHaupttext', () => {
  it('nimmt titel, sonst hinweis, sonst grund, sonst —', () => {
    expect(proposalHaupttext({ titel: 'T', hinweis: 'H' })).toBe('T')
    expect(proposalHaupttext({ hinweis: 'H' })).toBe('H')
    expect(proposalHaupttext({ grund: 'G' })).toBe('G')
    expect(proposalHaupttext({})).toBe('—')
  })
})
