import { describe, expect, it } from 'vitest'
import { getSvSubphase, type FallSubphaseInput } from './subphase'

// CMM-49 T1.2: getSvSubphase liest die abgeleitete Phase (v_claim_phase main_phase/sub_phase)
// statt legacy faelle.status. baseFall = begutachtung/'termin' → triggert keinen Phase-5/6-
// Branch, sodass die Datums-Logik (sv_termin/gutachten_eingegangen_am) greift.
const baseFall: FallSubphaseInput = {
  main_phase: 'begutachtung',
  sub_phase: 'termin',
  gutachter_termin_bestaetigt: false,
  sv_termin: null,
  gutachten_eingegangen_am: null,
  zahlung_eingegangen_am: null,
}

describe('getSvSubphase', () => {
  it('4.1 auftrag-eingegangen: kein bestätigter Termin, keine Daten', () => {
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

  it('4.4 Übergangs-Zustand: Gutachten da, noch nicht Phase 5', () => {
    const s = getSvSubphase({
      ...baseFall,
      gutachten_eingegangen_am: new Date().toISOString(),
    })
    expect(s.code).toBe('gutachten-erstellen')
    expect(s.label).toMatch(/wartet auf Kanzlei/)
  })

  it('5.1 kanzlei-uebergeben: sub_phase=kanzlei_uebergabe', () => {
    const s = getSvSubphase({ ...baseFall, sub_phase: 'kanzlei_uebergabe' })
    expect(s.code).toBe('kanzlei-uebergeben')
    expect(s.phase).toBe(5)
  })

  it('5.3 regulierung: sub_phase=versicherungskontakt', () => {
    const s = getSvSubphase({ ...baseFall, sub_phase: 'versicherungskontakt' })
    expect(s.code).toBe('regulierung')
    expect(s.phase).toBe(5)
  })

  // ⚠ Die beiden Tests darueber trugen frueher den Zusatz „== alt filmcheck/qc"
  // bzw. „== alt anschlussschreiben, kollabiert" — sie behaupteten damit dieselbe
  // Zuordnung wie der Code und speisten nur den erwarteten Wert ein. Auf prod
  // gemessen (30.08.2026) fuehrt die DB diese Werte EIGENSTAENDIG; sie fielen
  // deshalb auf den Phase-4-Default zurueck. Die folgenden Faelle sind die real
  // vorkommenden Werte — sie sind der eigentliche Regressionsschutz.
  it.each([
    ['anschlussschreiben', 'regulierung'],
    ['vs-kuerzt', 'regulierung'],
    ['filmcheck', 'kanzlei-uebergeben'],
    ['qc-pruefung', 'kanzlei-uebergeben'],
    ['an_externe_kanzlei', 'kanzlei-uebergeben'],
  ])('5.x echter DB-Wert sub_phase=%s -> Phase 5 (%s)', (subPhase, code) => {
    const s = getSvSubphase({ ...baseFall, sub_phase: subPhase })
    expect(s.code).toBe(code)
    expect(s.phase).toBe(5)
  })

  it('Phase-4-Werte bleiben Phase 4 (Gegenprobe: der Fix greift nicht zu weit)', () => {
    for (const subPhase of ['termin', 'sa_offen', 'vollmacht_offen', 'gutachten']) {
      const s = getSvSubphase({ ...baseFall, sub_phase: subPhase })
      expect(s.phase, `${subPhase} darf Phase 4 bleiben`).toBe(4)
    }
  })

  it('6.1 zahlung-eingegangen: sub_phase=auszahlung (== alt zahlung-eingegangen)', () => {
    const s = getSvSubphase({ ...baseFall, sub_phase: 'auszahlung' })
    expect(s.code).toBe('zahlung-eingegangen')
    expect(s.phase).toBe(6)
  })

  it('6.1 zahlung-eingegangen: sub_phase=erfolgreich_reguliert (== alt abgeschlossen)', () => {
    const s = getSvSubphase({ ...baseFall, sub_phase: 'erfolgreich_reguliert' })
    expect(s.code).toBe('zahlung-eingegangen')
    expect(s.phase).toBe(6)
  })

  it('6.2 honorar-ueberwiesen: gutachter_abrechnungen.ausgezahlt_am gesetzt (vor Terminal-Substate)', () => {
    const s = getSvSubphase(
      { ...baseFall, sub_phase: 'erfolgreich_reguliert' },
      { ausgezahlt_am: new Date().toISOString() },
    )
    expect(s.code).toBe('honorar-ueberwiesen')
  })

  it('Terminal: storniert (sub_phase=storniert)', () => {
    const s = getSvSubphase({ ...baseFall, sub_phase: 'storniert' })
    expect(s.code).toBe('storniert')
    expect(s.phaseLabel).toBe('Storniert')
  })
})
