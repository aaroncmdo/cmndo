import { describe, expect, it } from 'vitest'
import { getSvSubphase, type FallSubphaseInput } from './subphase'

const baseFall: FallSubphaseInput = {
  status: 'sv-zugewiesen',
  gutachter_termin_bestaetigt: false,
  sv_termin: null,
  gutachten_eingegangen_am: null,
  zahlung_eingegangen_am: null,
}

describe('getSvSubphase', () => {
  it('4.1 auftrag-eingegangen: status=sv-zugewiesen, kein bestätigter Termin', () => {
    const s = getSvSubphase(baseFall)
    expect(s.code).toBe('auftrag-eingegangen')
    expect(s.phase).toBe(4)
    expect(s.subphaseIndex).toBe(0)
  })

  it('4.2 termin-bestaetigt: Termin in Zukunft und bestätigt', () => {
    const zukunft = new Date(Date.now() + 86400000).toISOString()
    const s = getSvSubphase({
      ...baseFall,
      gutachter_termin_bestaetigt: true,
      sv_termin: zukunft,
    })
    expect(s.code).toBe('termin-bestaetigt')
    expect(s.subphaseIndex).toBe(1)
  })

  it('4.3 vor-ort: Termin liegt <24h zurück, kein Gutachten', () => {
    const vor6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    const s = getSvSubphase({
      ...baseFall,
      gutachter_termin_bestaetigt: true,
      sv_termin: vor6h,
    })
    expect(s.code).toBe('vor-ort')
  })

  it('4.4 gutachten-erstellen: Termin >24h zurück, kein Gutachten', () => {
    const vor2t = new Date(Date.now() - 2 * 86400000).toISOString()
    const s = getSvSubphase({
      ...baseFall,
      gutachter_termin_bestaetigt: true,
      sv_termin: vor2t,
    })
    expect(s.code).toBe('gutachten-erstellen')
  })

  it('4.4 Übergangs-Zustand: Gutachten da, Status noch nicht Phase 5', () => {
    const s = getSvSubphase({
      ...baseFall,
      gutachten_eingegangen_am: new Date().toISOString(),
    })
    expect(s.code).toBe('gutachten-erstellen')
    expect(s.label).toMatch(/wartet auf Kanzlei/)
  })

  it('5.1 kanzlei-uebergeben: status=kanzlei-uebergeben', () => {
    const s = getSvSubphase({ ...baseFall, status: 'kanzlei-uebergeben' })
    expect(s.code).toBe('kanzlei-uebergeben')
    expect(s.phase).toBe(5)
  })

  it('5.1 kanzlei-uebergeben: status=filmcheck ist gleiche Subphase', () => {
    const s = getSvSubphase({ ...baseFall, status: 'filmcheck' })
    expect(s.code).toBe('kanzlei-uebergeben')
  })

  it('5.2 anspruchsschreiben: status=anschlussschreiben', () => {
    const s = getSvSubphase({ ...baseFall, status: 'anschlussschreiben' })
    expect(s.code).toBe('anspruchsschreiben')
  })

  it('5.3 regulierung: status=regulierung', () => {
    const s = getSvSubphase({ ...baseFall, status: 'regulierung' })
    expect(s.code).toBe('regulierung')
  })

  it('6.1 zahlung-eingegangen: status=zahlung-eingegangen', () => {
    const s = getSvSubphase({ ...baseFall, status: 'zahlung-eingegangen' })
    expect(s.code).toBe('zahlung-eingegangen')
    expect(s.phase).toBe(6)
  })

  it('6.2 honorar-ueberwiesen: gutachter_abrechnungen.ausgezahlt_am gesetzt', () => {
    const s = getSvSubphase(
      { ...baseFall, status: 'abgeschlossen' },
      { ausgezahlt_am: new Date().toISOString() },
    )
    expect(s.code).toBe('honorar-ueberwiesen')
  })

  it('Terminal: storniert', () => {
    const s = getSvSubphase({ ...baseFall, status: 'storniert' })
    expect(s.code).toBe('storniert')
    expect(s.phaseLabel).toBe('Storniert')
  })
})
