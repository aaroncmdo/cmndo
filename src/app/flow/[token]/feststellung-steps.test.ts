import { describe, it, expect } from 'vitest'
import {
  FESTSTELLUNG_STEPS,
  computeActiveFeststellungSteps,
  meetsCondition,
} from './feststellung-steps'
import type { OnboardingFeld } from '@/components/onboarding/types'

// Minimal-Shape: die Funktion liest nur conditional_on aus felderByKey.
type FeldStub = Pick<OnboardingFeld, 'conditional_on'>

// Volle Config: jeder feldKey aller felder-Steps unbedingt sichtbar, ausser den
// gegner-Feldern (conditional_on schuldfrage=gegner) — spiegelt die echte Config.
function volleFelderMap(): Map<string, FeldStub> {
  const m = new Map<string, FeldStub>()
  for (const step of FESTSTELLUNG_STEPS) {
    if (step.kind !== 'felder') continue
    for (const k of step.feldKeys) {
      m.set(k, {
        conditional_on: step.id === 'gegner' ? { feld: 'schuldfrage', equals: 'gegner' } : null,
      })
    }
  }
  return m
}

describe('computeActiveFeststellungSteps', () => {
  // ── REPRODUKTION des AAR-956-"1/1"-Bugs ──────────────────────────────────
  // Genau der Zustand nach dem /flow-RSC-Re-Render: feststellungPhasen wird []
  // (page.tsx feststellungNeeded = !lead.unfallhergang), also ist felderByKey leer.
  // Vor dem Fix nahm FlowFeststellungStep diese leere Config live → Kollaps.
  it('REPRO: leere felderByKey kollabiert auf den einzigen (immer-sichtbaren) zb1-Step → "1/1"', () => {
    const active = computeActiveFeststellungSteps(new Map(), {})
    expect(active).toHaveLength(1)
    expect(active[0]?.kind).toBe('zb1')
    expect(active[0]?.id).toBe('fahrzeugschein')
  })

  // ── Beleg, dass die mount-stabile (volle) Config NICHT kollabiert ────────
  it('volle Config → mehrere Schritte, kein Kollaps', () => {
    const active = computeActiveFeststellungSteps(volleFelderMap(), {})
    expect(active.length).toBeGreaterThan(1)
    expect(active.some((s) => s.id === 'hergang')).toBe(true)
    expect(active.some((s) => s.id === 'dein_fahrzeug')).toBe(true)
    expect(active.some((s) => s.kind === 'zb1')).toBe(true)
  })

  it('polizeibericht-Step nur bei polizei_vor_ort=true', () => {
    const ohne = computeActiveFeststellungSteps(volleFelderMap(), {})
    const mit = computeActiveFeststellungSteps(volleFelderMap(), { polizei_vor_ort: 'true' })
    expect(ohne.some((s) => s.kind === 'polizeibericht')).toBe(false)
    expect(mit.some((s) => s.kind === 'polizeibericht')).toBe(true)
  })

  it('gegner-Step nur bei schuldfrage=gegner (conditional_on)', () => {
    const ohne = computeActiveFeststellungSteps(volleFelderMap(), {})
    const mit = computeActiveFeststellungSteps(volleFelderMap(), { schuldfrage: 'gegner' })
    expect(ohne.some((s) => s.id === 'gegner')).toBe(false)
    expect(mit.some((s) => s.id === 'gegner')).toBe(true)
  })

  it('meetsCondition: ohne Bedingung true, sonst exakter String-Vergleich', () => {
    expect(meetsCondition(null, {})).toBe(true)
    expect(meetsCondition({ feld: 'schuldfrage', equals: 'gegner' }, { schuldfrage: 'gegner' })).toBe(true)
    expect(meetsCondition({ feld: 'schuldfrage', equals: 'gegner' }, { schuldfrage: 'eigen' })).toBe(false)
    expect(meetsCondition({ feld: 'x', equals: 'true' }, {})).toBe(false)
  })
})
