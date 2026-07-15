import { describe, it, expect } from 'vitest'
import { sanitizeBedarf } from '../sanitize'

describe('sanitizeBedarf', () => {
  it('valider Bedarf bleibt erhalten', () => {
    const result = sanitizeBedarf({ kategorien: ['karosserie', 'lackierung'], quelle: 'schadenbild', confidence: 80 })
    expect(result).toEqual({ kategorien: ['karosserie', 'lackierung'], quelle: 'schadenbild', confidence: 80 })
  })

  it('non-Gewerk-Kategorien werden gefiltert', () => {
    const result = sanitizeBedarf({ kategorien: ['karosserie', 'nonsense', 42, 'glas'], quelle: 'schadenbild', confidence: 50 })
    expect(result.kategorien).toEqual(['karosserie', 'glas'])
  })

  it('confidence > 100 wird auf 100 geclamped (schuetzt int2)', () => {
    const result = sanitizeBedarf({ kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 32768 })
    expect(result.confidence).toBe(100)
  })

  it('negative confidence wird auf 0 geclamped', () => {
    const result = sanitizeBedarf({ kategorien: ['karosserie'], quelle: 'schadenbild', confidence: -5 })
    expect(result.confidence).toBe(0)
  })

  it('nicht-numerische confidence → 0', () => {
    const result = sanitizeBedarf({ kategorien: ['karosserie'], quelle: 'schadenbild', confidence: 'viel' })
    expect(result.confidence).toBe(0)
  })

  it('ungueltige quelle → unbekannt', () => {
    const result = sanitizeBedarf({ kategorien: ['karosserie'], quelle: 'hacker', confidence: 50 })
    expect(result.quelle).toBe('unbekannt')
  })

  it('valide quelle-Varianten bleiben', () => {
    expect(sanitizeBedarf({ kategorien: [], quelle: 'gutachten', confidence: 0 }).quelle).toBe('gutachten')
    expect(sanitizeBedarf({ kategorien: [], quelle: 'kva', confidence: 0 }).quelle).toBe('kva')
    expect(sanitizeBedarf({ kategorien: [], quelle: 'manuell', confidence: 0 }).quelle).toBe('manuell')
  })

  it('null / undefined / non-Objekt → sicherer unbekannt-Default', () => {
    const def = { kategorien: [], quelle: 'unbekannt', confidence: 0 }
    expect(sanitizeBedarf(null)).toEqual(def)
    expect(sanitizeBedarf(undefined)).toEqual(def)
    expect(sanitizeBedarf('string')).toEqual(def)
    expect(sanitizeBedarf(123)).toEqual(def)
  })

  it('fehlende Felder → Defaults', () => {
    const result = sanitizeBedarf({})
    expect(result).toEqual({ kategorien: [], quelle: 'unbekannt', confidence: 0 })
  })

  it('kategorien kein Array → leer', () => {
    const result = sanitizeBedarf({ kategorien: 'karosserie', quelle: 'schadenbild', confidence: 50 })
    expect(result.kategorien).toEqual([])
  })
})

describe('sanitizeBedarf — schadenbeschreibung-Quelle', () => {
  it('erhaelt quelle=schadenbeschreibung', () => {
    const r = sanitizeBedarf({ kategorien: ['karosserie'], quelle: 'schadenbeschreibung', confidence: 70 })
    expect(r.quelle).toBe('schadenbeschreibung')
  })
})
