// context-aktionen.test.ts
import { describe, it, expect } from 'vitest'
import { contextAktionen } from './context-aktionen'

describe('contextAktionen', () => {
  it('Lead-Modus zeigt Scrapen + CSV', () => {
    const a = contextAktionen('werkstatt', 'lead')
    expect(a.map((x) => x.kind)).toContain('scrape')
    expect(a.map((x) => x.kind)).toContain('csv')
  })
  it('SV-Pill zeigt Anlegen + Basis-Freigaben', () => {
    const a = contextAktionen('sv', 'alle')
    expect(a.map((x) => x.kind)).toContain('anlegen')
    expect(a.map((x) => x.kind)).toContain('freigaben')
  })
  it('Werkstatt-Pill zeigt QR-Pool', () => {
    expect(contextAktionen('werkstatt', 'alle').map((x) => x.kind)).toContain('qrpool')
  })
  it('Partner-Modus blendet Akquise (scrape/csv) aus', () => {
    expect(contextAktionen('makler', 'partner').map((x) => x.kind)).not.toContain('scrape')
  })
})
