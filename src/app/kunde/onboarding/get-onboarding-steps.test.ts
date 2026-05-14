import { describe, it, expect } from 'vitest'
import { getOnboardingSteps, buildOnboardingContext } from './get-onboarding-steps'

describe('AAR-903 getOnboardingSteps', () => {
  it('liefert alle 5 Steps wenn Kunde noch nichts hat', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: false,
      offenePflichtdokumente: 3,
    })
    expect(steps.map((s) => s.id)).toEqual([
      'welcome',
      'fall',
      'termin',
      'dokumente',
      'fertig',
    ])
  })

  it('skippt Termin-Step wenn schon Termin gebucht', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: true,
      offenePflichtdokumente: 2,
    })
    expect(steps.map((s) => s.id)).toEqual([
      'welcome',
      'fall',
      'dokumente',
      'fertig',
    ])
  })

  it('skippt Dokumente-Step wenn alle Pflichtdocs vollstaendig', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: false,
      offenePflichtdokumente: 0,
    })
    expect(steps.map((s) => s.id)).toEqual(['welcome', 'fall', 'termin', 'fertig'])
  })

  it('skippt beides — Kunde sieht nur Welcome + Fall + Fertig', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: true,
      offenePflichtdokumente: 0,
    })
    expect(steps.map((s) => s.id)).toEqual(['welcome', 'fall', 'fertig'])
  })

  it('Reihenfolge bleibt immer stabil', () => {
    const allCombos = [
      { hatTerminGebucht: false, offenePflichtdokumente: 0 },
      { hatTerminGebucht: true, offenePflichtdokumente: 5 },
      { hatTerminGebucht: true, offenePflichtdokumente: 0 },
      { hatTerminGebucht: false, offenePflichtdokumente: 1 },
    ]
    const expected: Record<string, number> = {
      welcome: 0,
      fall: 1,
      termin: 2,
      dokumente: 3,
      fertig: 4,
    }
    for (const ctx of allCombos) {
      const steps = getOnboardingSteps(ctx)
      // Steps muessen aufsteigend nach Master-Index sortiert sein
      const indices = steps.map((s) => expected[s.id])
      const sorted = [...indices].sort((a, b) => a - b)
      expect(indices).toEqual(sorted)
    }
  })
})

describe('AAR-903 buildOnboardingContext', () => {
  it('hatTerminGebucht=true wenn termin.datum gesetzt', () => {
    const ctx = buildOnboardingContext({
      termin: { datum: '2026-05-20T10:00:00Z' },
      pflichtDocs: [],
    })
    expect(ctx.hatTerminGebucht).toBe(true)
    expect(ctx.offenePflichtdokumente).toBe(0)
  })

  it('hatTerminGebucht=false wenn termin null', () => {
    const ctx = buildOnboardingContext({
      termin: null,
      pflichtDocs: [
        { id: 'a', status: 'offen' } as any,
        { id: 'b', status: 'hochgeladen' } as any,
      ],
    })
    expect(ctx.hatTerminGebucht).toBe(false)
    expect(ctx.offenePflichtdokumente).toBe(1)
  })
})
