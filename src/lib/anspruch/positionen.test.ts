import { describe, it, expect } from 'vitest'
import { berechneAnspruchsSpanne } from './positionen'
import type { Segment, SegmentSatz, WertminderungFaktor, AnspruchConfig, SchaetzInput } from './types'

const SAETZE: Record<Segment, SegmentSatz> = {
  kleinwagen: { tagessatzMinEur: 29, tagessatzMaxEur: 35 },
  kompakt: { tagessatzMinEur: 38, tagessatzMaxEur: 43 },
  mittelklasse: { tagessatzMinEur: 50, tagessatzMaxEur: 59 },
  oberklasse: { tagessatzMinEur: 65, tagessatzMaxEur: 79 },
  suv: { tagessatzMinEur: 59, tagessatzMaxEur: 79 },
  transporter: { tagessatzMinEur: 50, tagessatzMaxEur: 65 },
}
const FAKTOREN: WertminderungFaktor[] = [
  { alterBisJahre: 2, faktorMin: 0.15, faktorMax: 0.30 },
  { alterBisJahre: 5, faktorMin: 0.05, faktorMax: 0.15 },
]
const CONFIG: AnspruchConfig = {
  kostenpauschaleEur: 30,
  wertminderungMinReparaturEur: 750,
  wertminderungMaxAlterJahre: 5,
  bagatelleSchwelleEur: 750,
  abschleppMinEur: 150,
  abschleppMaxEur: 350,
  dauerTage: { leicht: { min: 2, max: 4 }, mittel: { min: 5, max: 9 }, schwer: { min: 10, max: 21 } },
  totalschadenSchwelleProzent: 0.9,
  reparaturGrenzeProzent: 1.3,
  wiederbeschaffungsdauerTage: { min: 10, max: 14 },
}
const base: SchaetzInput = {
  reparaturMinEur: 900, reparaturMaxEur: 1800, schweregrad: 'mittel',
  segment: 'mittelklasse', fahrbereit: true, ezJahr: null, aktuellesJahr: 2026,
}

function typen(r: ReturnType<typeof berechneAnspruchsSpanne>) {
  return r.positionen.map((p) => p.typ)
}

describe('berechneAnspruchsSpanne', () => {
  it('fahrbereit + kein EZ: nur reparatur + gutachterkosten + kostenpauschale', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toEqual(['reparatur', 'gutachterkosten', 'kostenpauschale'])
    // reparatur 900..1800 + pauschale 30..30 ; gutachterkosten zaehlt NICHT in Gesamt
    expect(r.gesamtMinEur).toBe(930)
    expect(r.gesamtMaxEur).toBe(1830)
  })

  it('nicht fahrbereit: nutzungsausfall (segment x dauer) + abschleppkosten kommen dazu', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: false }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toContain('nutzungsausfall')
    expect(typen(r)).toContain('abschleppkosten')
    const na = r.positionen.find((p) => p.typ === 'nutzungsausfall')!
    // mittelklasse 50..59 x dauer mittel 5..9 => 250..531
    expect(na.minEur).toBe(250)
    expect(na.maxEur).toBe(531)
  })

  it('fahrbereit unterdrueckt nutzungsausfall UND abschleppkosten', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: true }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).not.toContain('nutzungsausfall')
    expect(typen(r)).not.toContain('abschleppkosten')
  })

  it('junges Fzg (<=2J) + mittel + Reparatur>Schwelle: wertminderung mit Faktor 0.15..0.30 auf Mitte', () => {
    const r = berechneAnspruchsSpanne({ ...base, ezJahr: 2025 }, SAETZE, FAKTOREN, CONFIG)
    const wm = r.positionen.find((p) => p.typ === 'wertminderung')!
    // Mitte (900+1800)/2 = 1350 ; 0.15..0.30 => 202.5..405 -> gerundet 203..405
    expect(wm.minEur).toBe(203)
    expect(wm.maxEur).toBe(405)
  })

  it('altes Fzg (>5J): keine wertminderung', () => {
    const r = berechneAnspruchsSpanne({ ...base, ezJahr: 2015 }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).not.toContain('wertminderung')
  })

  it('leichter Schaden: keine wertminderung, Bagatelle-Hinweis', () => {
    const r = berechneAnspruchsSpanne(
      { ...base, ezJahr: 2025, schweregrad: 'leicht', reparaturMinEur: 300, reparaturMaxEur: 600 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(typen(r)).not.toContain('wertminderung')
    expect(r.hinweise.join(' ')).toMatch(/Bagatelle|gering/i)
  })

  it('gutachterkosten immer vorhanden + gedecktDurchGegner, minEur null', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG)
    const gk = r.positionen.find((p) => p.typ === 'gutachterkosten')!
    expect(gk.gedecktDurchGegner).toBe(true)
    expect(gk.minEur).toBeNull()
  })

  // --- Totalschaden-Zonen ---

  it('Zone A: ohne WBW kein Totalschaden-Block', () => {
    const s = berechneAnspruchsSpanne(
      { ...base, wbwMinEur: null, wbwMaxEur: null, restwertMinEur: null, restwertMaxEur: null },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(s.totalschaden).toBeUndefined()
  })

  it('Zone C: Reparatur > 130% WBW -> reparaturWeg null, guenstiger totalschaden', () => {
    // reparaturMitte = (18000+32000)/2 = 25000; wbwMitte = (15000+21000)/2 = 18000
    // verhaeltnis = 25000/18000 = 1.389 > 1.3 -> Zone C
    const s = berechneAnspruchsSpanne(
      { ...base, reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(s.totalschaden).toBeDefined()
    expect(s.totalschaden!.reparaturWeg).toBeNull()
    expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBeGreaterThan(0)
    expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBe(11030)  // 10500 Fahrzeugschaden + 500 NA + 30 Pauschale
    expect(s.totalschaden!.totalschadenWeg.summeMaxEur).toBe(18856)  // 18000 + 826 + 30
    expect(s.totalschaden!.guenstiger).toBe('totalschaden')
  })

  it('Zone B: 90-130% WBW -> beide Wege, Wertminderung im Reparatur-Weg', () => {
    // reparaturMitte = (20000+26000)/2 = 23000; wbwMitte = (22000+28000)/2 = 25000
    // verhaeltnis = 23000/25000 = 0.92 >= 0.9 und <= 1.3 -> Zone B
    // alter = 2026 - 2023 = 3 -> Faktor { alterBisJahre: 5, faktorMin: 0.05, faktorMax: 0.15 } -> wertminderung applies
    const s = berechneAnspruchsSpanne(
      { ...base, reparaturMinEur: 20000, reparaturMaxEur: 26000, ezJahr: 2023, wbwMinEur: 22000, wbwMaxEur: 28000, restwertMinEur: 6000, restwertMaxEur: 8000 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(s.totalschaden!.reparaturWeg).not.toBeNull()
    expect(s.totalschaden!.reparaturWeg!.positionen.some((p) => p.typ === 'wertminderung')).toBe(true)
    expect(s.totalschaden!.reparaturWeg!.summeMinEur).toBe(21180)   // reparatur 20000 + WM 1150 + Pauschale 30
    expect(s.totalschaden!.reparaturWeg!.summeMaxEur).toBe(29480)   // 26000 + 3450 + 30
    expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBe(14530) // 14000 + 500 + 30
    expect(s.totalschaden!.totalschadenWeg.summeMaxEur).toBe(22856) // 22000 + 826 + 30
    expect(s.totalschaden!.guenstiger).toBe('reparatur')            // 29480 >= 22856
  })

  it('Totalschaden: Restwert > WBW -> Fahrzeugschaden auf 0 gefloort (nie negativ)', () => {
    const s = berechneAnspruchsSpanne(
      { ...base, reparaturMinEur: 20000, reparaturMaxEur: 20000, wbwMinEur: 10000, wbwMaxEur: 12000, restwertMinEur: 11000, restwertMaxEur: 13000 },
      SAETZE, FAKTOREN, CONFIG,
    )
    const fz = s.totalschaden!.totalschadenWeg.positionen.find((p) => p.typ === 'reparatur')!
    expect(fz.minEur).toBe(0)        // max(0, 10000 - 13000)
    expect(fz.maxEur).toBe(1000)     // max(0, 12000 - 11000)
    expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBeGreaterThanOrEqual(0)
  })
})
