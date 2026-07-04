import { describe, it, expect } from 'vitest'
import { plausibilisiereWbw } from './wbw'
import type { WbwHeuristikBand } from './types'

const H: WbwHeuristikBand[] = [
  { segment: 'mittelklasse', alterBisJahre: 3, wbwMinEur: 20000, wbwMaxEur: 32000, restwertFaktor: 0.30 },
  { segment: 'mittelklasse', alterBisJahre: 99, wbwMinEur: 3500, wbwMaxEur: 10000, restwertFaktor: 0.20 },
]

// 3-Band-Fixture fuer null-Alter-Test
const H3: WbwHeuristikBand[] = [
  { segment: 'mittelklasse', alterBisJahre: 3,  wbwMinEur: 20000, wbwMaxEur: 32000, restwertFaktor: 0.30 },
  { segment: 'mittelklasse', alterBisJahre: 8,  wbwMinEur: 10000, wbwMaxEur: 20000, restwertFaktor: 0.25 },
  { segment: 'mittelklasse', alterBisJahre: 99, wbwMinEur: 3500,  wbwMaxEur: 10000, restwertFaktor: 0.20 },
]

describe('plausibilisiereWbw', () => {
  it('nutzt Vision-WBW wenn im Heuristik-Korridor', () => {
    const r = plausibilisiereWbw({ wiederbeschaffungswert_min: 24000, wiederbeschaffungswert_max: 28000, restwert_min: 6000, restwert_max: 8000 }, 'mittelklasse', 3, H)
    expect(r.wbwMin).toBe(24000); expect(r.wbwMax).toBe(28000); expect(r.quelle).toBe('vision')
  })
  it('klemmt Vision-Ausreisser auf den Korridor', () => {
    const r = plausibilisiereWbw({ wiederbeschaffungswert_min: 90000, wiederbeschaffungswert_max: 120000, restwert_min: null, restwert_max: null }, 'mittelklasse', 3, H)
    // Beide Vision-Werte (90000/120000) liegen UEBER dem Korridor -> beide klemmen auf hi.
    // (Der lo-Floor 12000 = 20000*0.6 wird nur von einem Unterschreiter erreicht, den dieser Fall nicht liefert.)
    expect(r.wbwMin).toBe(51200)   // clamped to hi = 32000 * 1.6
    expect(r.wbwMax).toBe(51200)   // clamped to hi = 32000 * 1.6
    expect(r.quelle).toBe('vision-geklemmt')
  })
  it('faellt auf Heuristik zurueck wenn Vision keinen WBW liefert', () => {
    const r = plausibilisiereWbw({ wiederbeschaffungswert_min: null, wiederbeschaffungswert_max: null, restwert_min: null, restwert_max: null }, 'mittelklasse', 3, H)
    expect(r.wbwMin).toBe(20000); expect(r.wbwMax).toBe(32000); expect(r.quelle).toBe('heuristik')
    // Restwert aus Faktor: 0.30 * wbw
    expect(r.restwertMin).toBe(6000); expect(r.restwertMax).toBe(9600)
  })
  it('waehlt mittleres WBW-Band wenn Alter unbekannt (null) — kein Falsch-Totalschaden', () => {
    // 3 Bands: Indizes 0 (<=3), 1 (<=8), 2 (<=99). Mittleres = Index floor((3-1)/2) = 1 -> wbwMin 10000, wbwMax 20000
    const r = plausibilisiereWbw(
      { wiederbeschaffungswert_min: null, wiederbeschaffungswert_max: null, restwert_min: null, restwert_max: null },
      'mittelklasse',
      null,
      H3,
    )
    expect(r.wbwMin).toBe(10000)
    expect(r.wbwMax).toBe(20000)
    expect(r.quelle).toBe('heuristik')
  })
})
