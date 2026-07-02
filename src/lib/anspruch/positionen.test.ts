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
})
