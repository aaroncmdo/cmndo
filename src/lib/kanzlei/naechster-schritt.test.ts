import { describe, it, expect } from 'vitest'
import { naechsterKanzleiSchritt } from './naechster-schritt'

describe('naechsterKanzleiSchritt', () => {
  it('filmcheck -> QC-Aktion', () => {
    expect(naechsterKanzleiSchritt('filmcheck')?.faktKey).toBe('qc')
  })
  it('kanzlei-uebergeben -> anschlussschreiben', () => {
    expect(naechsterKanzleiSchritt('kanzlei-uebergeben')?.faktKey).toBe('anschlussschreiben')
  })
  it('anschlussschreiben -> vs_reaktion', () => {
    expect(naechsterKanzleiSchritt('anschlussschreiben')?.faktKey).toBe('vs_reaktion')
  })
  it('vs-kuerzt -> regulierung', () => {
    expect(naechsterKanzleiSchritt('vs-kuerzt')?.faktKey).toBe('regulierung')
  })
  it('vs-abgelehnt -> klage', () => {
    expect(naechsterKanzleiSchritt('vs-abgelehnt')?.faktKey).toBe('klage')
  })
  it('regulierung-laeuft + regulierung -> zahlung', () => {
    expect(naechsterKanzleiSchritt('regulierung-laeuft')?.faktKey).toBe('zahlung')
    expect(naechsterKanzleiSchritt('regulierung')?.faktKey).toBe('zahlung')
  })
  it('klage + zahlung-eingegangen -> abschluss', () => {
    expect(naechsterKanzleiSchritt('klage')?.faktKey).toBe('abschluss')
    expect(naechsterKanzleiSchritt('zahlung-eingegangen')?.faktKey).toBe('abschluss')
  })
  it('SV-Track / terminal / unbekannt -> null (kein KB-Dateneintrag noetig)', () => {
    expect(naechsterKanzleiSchritt('sv-termin')).toBeNull()
    expect(naechsterKanzleiSchritt('gutachten-eingegangen')).toBeNull()
    expect(naechsterKanzleiSchritt('abgeschlossen')).toBeNull()
    expect(naechsterKanzleiSchritt('storniert')).toBeNull()
    expect(naechsterKanzleiSchritt(null)).toBeNull()
  })
  it('jeder Hinweis hat Umlaut-faehigen Text (kein leerer titel/hinweis)', () => {
    for (const s of ['filmcheck', 'kanzlei-uebergeben', 'anschlussschreiben', 'vs-kuerzt', 'vs-abgelehnt', 'regulierung-laeuft', 'klage']) {
      const r = naechsterKanzleiSchritt(s)
      expect(r?.titel.length).toBeGreaterThan(0)
      expect(r?.hinweis.length).toBeGreaterThan(0)
    }
  })
})
