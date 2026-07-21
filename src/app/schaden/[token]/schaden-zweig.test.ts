import { describe, it, expect } from 'vitest'
import { schadenZweig } from './schaden-zweig'

describe('schadenZweig', () => {
  const base = {
    istFlottenmanager: true,
    fmFirmaId: 'f1',
    kartenFirmaId: 'f1',
    status: 'frei' as string | null,
  }

  it('FM + eigene Firma + ungebunden -> bind', () => {
    expect(schadenZweig({ ...base, status: 'frei' })).toBe('bind')
    expect(schadenZweig({ ...base, status: 'bestellt' })).toBe('bind')
  })

  it('FM + eigene Firma + gebunden -> manage', () => {
    expect(schadenZweig({ ...base, status: 'gebunden' })).toBe('manage')
  })

  it('FM + fremde Firma -> gegner', () => {
    expect(schadenZweig({ ...base, kartenFirmaId: 'f2' })).toBe('gegner')
  })

  it('nicht-FM (z.B. Gegner/Fahrer) -> gegner', () => {
    expect(schadenZweig({ ...base, istFlottenmanager: false })).toBe('gegner')
    expect(
      schadenZweig({ ...base, istFlottenmanager: false, status: 'gebunden' }),
    ).toBe('gegner')
  })

  it('FM ohne eigene Firma -> gegner', () => {
    expect(schadenZweig({ ...base, fmFirmaId: null })).toBe('gegner')
  })

  it('Karte ohne Firma -> gegner', () => {
    expect(schadenZweig({ ...base, kartenFirmaId: null })).toBe('gegner')
  })
})
