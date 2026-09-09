import { describe, it, expect } from 'vitest'
import { getOnboardingSteps, buildOnboardingContext, naechsterSichtbarerStep } from './get-onboarding-steps'

describe('AAR-903 getOnboardingSteps', () => {
  it('liefert alle 5 Steps wenn Kunde noch nichts hat', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: false,
      offenePflichtdokumente: 3,
      brauchtGutachter: true,
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
      brauchtGutachter: true,
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
      brauchtGutachter: true,
    })
    expect(steps.map((s) => s.id)).toEqual(['welcome', 'fall', 'termin', 'fertig'])
  })

  it('skippt beides — Kunde sieht nur Welcome + Fall + Fertig', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: true,
      offenePflichtdokumente: 0,
      brauchtGutachter: true,
    })
    expect(steps.map((s) => s.id)).toEqual(['welcome', 'fall', 'fertig'])
  })

  it('Reihenfolge bleibt immer stabil', () => {
    const allCombos = [
      { hatTerminGebucht: false, offenePflichtdokumente: 0, brauchtGutachter: true },
      { hatTerminGebucht: true, offenePflichtdokumente: 5, brauchtGutachter: true },
      { hatTerminGebucht: true, offenePflichtdokumente: 0, brauchtGutachter: true },
      { hatTerminGebucht: false, offenePflichtdokumente: 1, brauchtGutachter: true },
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

// Audit-Bug D (Kasko-Audit 15.07.): Kasko/Selbstzahler = Werkstatt-Reparatur-Weg OHNE SV
// -> der SV-Termin-Step entfaellt komplett (nicht nur "schon gebucht").
describe('Audit-Bug D — abrechnungsweg-aware Termin-Step', () => {
  it('brauchtGutachter=false -> KEIN termin-Step, auch ohne gebuchten Termin', () => {
    const steps = getOnboardingSteps({
      hatTerminGebucht: false,
      offenePflichtdokumente: 2,
      brauchtGutachter: false,
    })
    expect(steps.map((s) => s.id)).toEqual(['welcome', 'fall', 'dokumente', 'fertig'])
  })

  it('buildOnboardingContext: kasko/selbstzahler -> brauchtGutachter=false', () => {
    for (const weg of ['kasko', 'selbstzahler']) {
      const ctx = buildOnboardingContext({ termin: null, pflichtDocs: [], abrechnungsweg: weg })
      expect(ctx.brauchtGutachter).toBe(false)
    }
  })

  it('buildOnboardingContext: haftpflicht / unbekannt / fehlend -> brauchtGutachter=true (sicherer Default)', () => {
    for (const weg of ['haftpflicht', null, undefined] as const) {
      const ctx = buildOnboardingContext({ termin: null, pflichtDocs: [], abrechnungsweg: weg })
      expect(ctx.brauchtGutachter).toBe(true)
    }
  })
})

// 09.09.2026 — der tote „Weiter"-Button. Ein Sprung auf eine feste Step-ID
// laeuft ins Leere, sobald dieser Schritt fuer den Kunden gefiltert ist.
describe('naechsterSichtbarerStep', () => {
  const steps = (ctx: Parameters<typeof getOnboardingSteps>[0]) => getOnboardingSteps(ctx)
  const VOLL = { hatTerminGebucht: false, offenePflichtdokumente: 3, brauchtGutachter: true }
  const MIT_TERMIN = { hatTerminGebucht: true, offenePflichtdokumente: 3, brauchtGutachter: true }
  const WERKSTATT = { hatTerminGebucht: false, offenePflichtdokumente: 0, brauchtGutachter: false }

  it('voller Wizard: von "fall" geht es zum Termin', () => {
    expect(naechsterSichtbarerStep(steps(VOLL), 'fall')).toBe('termin')
  })

  it('REGRESSION: Termin schon gebucht -> von "fall" geht es zu den Dokumenten', () => {
    // Der Fall aus Aarons Meldung: der Termin-Step ist gefiltert, der Button
    // sprang auf 'termin' und tat nichts.
    expect(naechsterSichtbarerStep(steps(MIT_TERMIN), 'fall')).toBe('dokumente')
  })

  it('REGRESSION: Werkstatt-Weg ohne offene Dokumente -> von "fall" direkt zu "fertig"', () => {
    expect(naechsterSichtbarerStep(steps(WERKSTATT), 'fall')).toBe('fertig')
  })

  it('REGRESSION: kein Dokumente-Step -> von "termin" geht es zu "fertig"', () => {
    const ohneDocs = { hatTerminGebucht: false, offenePflichtdokumente: 0, brauchtGutachter: true }
    expect(naechsterSichtbarerStep(steps(ohneDocs), 'termin')).toBe('fertig')
  })

  it('letzter Schritt hat kein Weiter', () => {
    expect(naechsterSichtbarerStep(steps(VOLL), 'fertig')).toBeNull()
  })

  it('ein Schritt, den dieser Kunde gar nicht hat, liefert kein Ziel', () => {
    expect(naechsterSichtbarerStep(steps(MIT_TERMIN), 'termin')).toBeNull()
  })
})
