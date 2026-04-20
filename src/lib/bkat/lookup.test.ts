// AAR-503 (B1): Unit-Test für isValidTbnrFormat + aggregateSchuldindiz.
// lookupTbnr/extractTbnrsFromText brauchen DB-Zugriff und werden in
// Integrations-Tests (Playwright) abgedeckt.

import { describe, expect, it } from 'vitest'
import { isValidTbnrFormat, aggregateSchuldindiz, type BkatTatbestand } from './lookup'

describe('isValidTbnrFormat', () => {
  it('accepts 6-digit TBNRs with leading digit 1-9', () => {
    expect(isValidTbnrFormat('108600')).toBe(true)
    expect(isValidTbnrFormat('411001')).toBe(true)
    expect(isValidTbnrFormat('132404')).toBe(true)
  })

  it('rejects strings with leading 0', () => {
    expect(isValidTbnrFormat('010000')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidTbnrFormat('10860')).toBe(false)
    expect(isValidTbnrFormat('1086000')).toBe(false)
    expect(isValidTbnrFormat('')).toBe(false)
  })

  it('rejects non-digit chars', () => {
    expect(isValidTbnrFormat('108A00')).toBe(false)
    expect(isValidTbnrFormat('108-600')).toBe(false)
  })
})

function makeTb(schuld: BkatTatbestand['schuldindiz']): BkatTatbestand {
  return {
    tbnr: '100000',
    vorschrift: '1',
    paragraph: '§ 1',
    paragraph_num: 1,
    bezeichnung: 'Test',
    kurzform: 'Test',
    unfallart: 'sonstiges',
    schuldindiz: schuld,
    mit_gefaehrdung: null,
    mit_sachbeschaedigung: null,
    mit_unfall: null,
    bussgeld_cent: null,
    punkte: null,
    fahrverbot_monate: null,
    bkat_version: '2023-09-01',
    erstellt_am: null,
    aktualisiert_am: null,
  }
}

describe('aggregateSchuldindiz', () => {
  it('returns null/false for empty input', () => {
    expect(aggregateSchuldindiz([])).toEqual({ primaer: null, kundeVerdacht: false })
  })

  it('prefers gegner_klar over weaker signals', () => {
    const r = aggregateSchuldindiz([
      makeTb('neutral'),
      makeTb('gegner_klar'),
      makeTb('geteilt'),
    ])
    expect(r.primaer).toBe('gegner_klar')
  })

  it('flags kundeVerdacht when any TB is kunde_verdacht', () => {
    const r = aggregateSchuldindiz([
      makeTb('gegner_klar'),
      makeTb('kunde_verdacht'),
    ])
    expect(r.primaer).toBe('gegner_klar')
    expect(r.kundeVerdacht).toBe(true)
  })

  it('returns neutral if only neutral signals', () => {
    expect(aggregateSchuldindiz([makeTb('neutral')])).toEqual({
      primaer: 'neutral',
      kundeVerdacht: false,
    })
  })
})
