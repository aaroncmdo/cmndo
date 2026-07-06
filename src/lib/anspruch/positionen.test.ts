import { describe, it, expect } from 'vitest'
import { berechneAnspruchsSpanne } from './positionen'
import type { Segment, SegmentSatz, WertminderungFaktor, AnspruchConfig, SchaetzInput } from './types'

const SAETZE: Record<Segment, SegmentSatz> = {
  kleinwagen: { tagessatzMinEur: 29, tagessatzMaxEur: 35, mietwagenMinEur: 35, mietwagenMaxEur: 49 },
  kompakt: { tagessatzMinEur: 38, tagessatzMaxEur: 43, mietwagenMinEur: 45, mietwagenMaxEur: 65 },
  mittelklasse: { tagessatzMinEur: 50, tagessatzMaxEur: 59, mietwagenMinEur: 60, mietwagenMaxEur: 85 },
  oberklasse: { tagessatzMinEur: 65, tagessatzMaxEur: 79, mietwagenMinEur: 100, mietwagenMaxEur: 150 },
  suv: { tagessatzMinEur: 59, tagessatzMaxEur: 79, mietwagenMinEur: 80, mietwagenMaxEur: 120 },
  transporter: { tagessatzMinEur: 50, tagessatzMaxEur: 65, mietwagenMinEur: 70, mietwagenMaxEur: 110 },
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
  verbringungEur: 130,
  ummeldungEur: 75,
}
const base: SchaetzInput = {
  reparaturMinEur: 900, reparaturMaxEur: 1800, schweregrad: 'mittel',
  segment: 'mittelklasse', fahrbereit: true, ezJahr: null, aktuellesJahr: 2026,
}

function typen(r: ReturnType<typeof berechneAnspruchsSpanne>) {
  return r.positionen.map((p) => p.typ)
}

describe('berechneAnspruchsSpanne', () => {
  it('fahrbereit + kein EZ: reparatur + verbringung + gutachterkosten + anwaltskosten + kostenpauschale (default unverschuldet)', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toEqual(['reparatur', 'verbringung', 'gutachterkosten', 'anwaltskosten', 'kostenpauschale'])
    // reparatur 900..1800 + verbringung 130 + pauschale 30 ; gutachterkosten + anwaltskosten gegner-gedeckt (nicht in Gesamt)
    expect(r.gesamtMinEur).toBe(1060)
    expect(r.gesamtMaxEur).toBe(1960)
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
    expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBe(11105)  // 10500 Fahrzeugschaden + 500 NA + 30 Pauschale + 75 Ummeldung
    expect(s.totalschaden!.totalschadenWeg.summeMaxEur).toBe(18931)  // 18000 + 826 + 30 + 75
    expect(s.totalschaden!.guenstiger).toBe('totalschaden')
    // gutachterkosten muss im TS-Weg vorhanden sein (gegner-getragen, null)
    const gk = s.totalschaden!.totalschadenWeg.positionen.find((p) => p.typ === 'gutachterkosten')
    expect(gk).toBeDefined()
    expect(gk!.gedecktDurchGegner).toBe(true)
    expect(gk!.minEur).toBeNull()
  })

  it('Totalschaden nicht fahrbereit: abschleppkosten im TS-Weg, Summe steigt um 150/350', () => {
    // Gleiche Zone-C-Inputs wie oben, aber fahrbereit: false
    const s = berechneAnspruchsSpanne(
      { ...base, fahrbereit: false, reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 },
      SAETZE, FAKTOREN, CONFIG,
    )
    const tw = s.totalschaden!.totalschadenWeg
    expect(tw.positionen.some((p) => p.typ === 'abschleppkosten')).toBe(true)
    const abschl = tw.positionen.find((p) => p.typ === 'abschleppkosten')!
    expect(abschl.minEur).toBe(150)   // CONFIG.abschleppMinEur
    // fahrbereit=true hatte 11030/18856; fahrbereit=false addiert 150/350
    expect(tw.summeMinEur).toBe(11255) // 10500 + 500 + 150 Abschlepp + 30 + 75 Ummeldung
    expect(tw.summeMaxEur).toBe(19281) // 18000 + 826 + 350 + 30 + 75
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
    expect(s.totalschaden!.reparaturWeg!.summeMinEur).toBe(21310)   // reparatur 20000 + WM 1150 + Verbringung 130 + Pauschale 30
    expect(s.totalschaden!.reparaturWeg!.summeMaxEur).toBe(29610)   // 26000 + 3450 + 130 + 30
    expect(s.totalschaden!.totalschadenWeg.summeMinEur).toBe(14605) // 14000 + 500 + 30 + 75 Ummeldung
    expect(s.totalschaden!.totalschadenWeg.summeMaxEur).toBe(22931) // 22000 + 826 + 30 + 75
    // reparaturMitte 23000 < wbwMitte 25000 -> kein 130%-Hinweis
    expect(s.totalschaden!.hinweisReparatur).toBeUndefined()
    // midpoint: reparaturMitte (21180+29480)/2 = 25330 >= tsMitte (14530+22856)/2 = 18693 -> 'reparatur'
    expect(s.totalschaden!.guenstiger).toBe('reparatur')
  })

  it('Zone B mit Reparatur > WBW: 130%-Hinweis gesetzt', () => {
    // reparaturMitte = (26000+28000)/2 = 27000; wbwMitte = (22000+28000)/2 = 25000
    // verhaeltnis = 27000/25000 = 1.08 >= 0.9 und <= 1.3 -> Zone B, aber Reparatur ueber WBW
    const s = berechneAnspruchsSpanne(
      { ...base, reparaturMinEur: 26000, reparaturMaxEur: 28000, ezJahr: 2023, wbwMinEur: 22000, wbwMaxEur: 28000, restwertMinEur: 6000, restwertMaxEur: 8000 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(s.totalschaden!.reparaturWeg).not.toBeNull()
    expect(s.totalschaden!.hinweisReparatur).toBeDefined()
    expect(s.totalschaden!.hinweisReparatur).toContain('130')
  })

  it('Zone B ohne Reparatur > WBW: kein 130%-Hinweis', () => {
    // reparaturMitte = (20000+26000)/2 = 23000; wbwMitte = (22000+28000)/2 = 25000 -> reparaturMitte < wbwMitte
    const s = berechneAnspruchsSpanne(
      { ...base, reparaturMinEur: 20000, reparaturMaxEur: 26000, ezJahr: 2023, wbwMinEur: 22000, wbwMaxEur: 28000, restwertMinEur: 6000, restwertMaxEur: 8000 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(s.totalschaden!.hinweisReparatur).toBeUndefined()
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

describe('Schuldfrage', () => {
  const typen = (r: ReturnType<typeof berechneAnspruchsSpanne>) => r.positionen.map((p) => p.typ)

  it('default (kein schuld) = unverschuldet: Anwaltskosten vorhanden + gegner-gedeckt, spanne.schuld gesetzt', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG)
    expect(r.schuld).toBe('unverschuldet')
    const aw = r.positionen.find((p) => p.typ === 'anwaltskosten')!
    expect(aw).toBeDefined()
    expect(aw.gedecktDurchGegner).toBe(true)
    expect(aw.minEur).toBeNull()
  })

  it('teilschuld: Anwaltskosten vorhanden (Gegner haftet anteilig)', () => {
    const r = berechneAnspruchsSpanne({ ...base, schuld: 'teilschuld' }, SAETZE, FAKTOREN, CONFIG)
    expect(r.schuld).toBe('teilschuld')
    expect(typen(r)).toContain('anwaltskosten')
  })

  it('selbst: KEINE Anwaltskosten (kein Gegner haftet)', () => {
    const r = berechneAnspruchsSpanne({ ...base, schuld: 'selbst' }, SAETZE, FAKTOREN, CONFIG)
    expect(r.schuld).toBe('selbst')
    expect(typen(r)).not.toContain('anwaltskosten')
  })

  it('Gesamtbetraege identisch ueber alle Schuldformen (Anwaltskosten null -> kein Summen-Effekt)', () => {
    const u = berechneAnspruchsSpanne({ ...base, schuld: 'unverschuldet' }, SAETZE, FAKTOREN, CONFIG)
    const s = berechneAnspruchsSpanne({ ...base, schuld: 'selbst' }, SAETZE, FAKTOREN, CONFIG)
    expect(u.gesamtMinEur).toBe(s.gesamtMinEur)
    expect(u.gesamtMaxEur).toBe(s.gesamtMaxEur)
  })

  it('Totalschaden unverschuldet: Anwaltskosten im TS-Weg, aber Summe unveraendert (gegner-gedeckt/null)', () => {
    const s = berechneAnspruchsSpanne(
      { ...base, schuld: 'unverschuldet', reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 },
      SAETZE, FAKTOREN, CONFIG,
    )
    const tw = s.totalschaden!.totalschadenWeg
    expect(tw.positionen.some((p) => p.typ === 'anwaltskosten')).toBe(true)
    expect(tw.summeMinEur).toBe(11105) // Zone-C-Wert inkl. Ummeldung; Anwaltskosten null -> kein Summen-Effekt
  })

  it('Totalschaden selbst: keine Anwaltskosten im TS-Weg', () => {
    const s = berechneAnspruchsSpanne(
      { ...base, schuld: 'selbst', reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 },
      SAETZE, FAKTOREN, CONFIG,
    )
    expect(s.totalschaden!.totalschadenWeg.positionen.some((p) => p.typ === 'anwaltskosten')).toBe(false)
  })
})

describe('Volle Positionen (Ersatzfahrzeug + Verbringung + Ummeldung)', () => {
  const typen = (r: ReturnType<typeof berechneAnspruchsSpanne>) => r.positionen.map((p) => p.typ)

  it('Ersatzfahrzeug=mietwagen (nicht fahrbereit): Mietwagen-Position statt Nutzungsausfall, Mietwagen-Satz', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: false, ersatzfahrzeug: 'mietwagen' }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toContain('mietwagen')
    expect(typen(r)).not.toContain('nutzungsausfall')
    const mw = r.positionen.find((p) => p.typ === 'mietwagen')!
    // mittelklasse mietwagen 60..85 x dauer mittel 5..9 => 300..765
    expect(mw.minEur).toBe(300)
    expect(mw.maxEur).toBe(765)
  })

  it('Ersatzfahrzeug=nutzungsausfall (default): Nutzungsausfall statt Mietwagen', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: false }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).toContain('nutzungsausfall')
    expect(typen(r)).not.toContain('mietwagen')
  })

  it('Ersatzfahrzeug=keins: weder Nutzungsausfall noch Mietwagen', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: false, ersatzfahrzeug: 'keins' }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).not.toContain('nutzungsausfall')
    expect(typen(r)).not.toContain('mietwagen')
  })

  it('fahrbereit: keine Ersatzfahrzeug-Position im Hauptweg', () => {
    const r = berechneAnspruchsSpanne({ ...base, fahrbereit: true }, SAETZE, FAKTOREN, CONFIG)
    expect(typen(r)).not.toContain('nutzungsausfall')
    expect(typen(r)).not.toContain('mietwagen')
  })

  it('Verbringung: bei nennenswerter Reparatur (>= Bagatelle) mit Fixbetrag', () => {
    const r = berechneAnspruchsSpanne(base, SAETZE, FAKTOREN, CONFIG) // reparaturMitte 1350 >= 750
    const vb = r.positionen.find((p) => p.typ === 'verbringung')!
    expect(vb).toBeDefined()
    expect(vb.minEur).toBe(130)
    expect(vb.maxEur).toBe(130)
  })

  it('Verbringung: bei Bagatelle-Reparatur (< Bagatelle) NICHT vorhanden', () => {
    const r = berechneAnspruchsSpanne({ ...base, reparaturMinEur: 300, reparaturMaxEur: 600 }, SAETZE, FAKTOREN, CONFIG) // mitte 450 < 750
    expect(typen(r)).not.toContain('verbringung')
  })

  it('Ummeldung: im Totalschaden-Weg mit Fixbetrag', () => {
    const s = berechneAnspruchsSpanne(
      { ...base, reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 },
      SAETZE, FAKTOREN, CONFIG,
    )
    const um = s.totalschaden!.totalschadenWeg.positionen.find((p) => p.typ === 'ummeldung')!
    expect(um).toBeDefined()
    expect(um.minEur).toBe(75)
  })

  it('Mietwagen fliesst in den Totalschaden-Weg (Wiederbeschaffung) statt Nutzungsausfall', () => {
    const s = berechneAnspruchsSpanne(
      { ...base, ersatzfahrzeug: 'mietwagen', reparaturMinEur: 18000, reparaturMaxEur: 32000, wbwMinEur: 15000, wbwMaxEur: 21000, restwertMinEur: 3000, restwertMaxEur: 4500 },
      SAETZE, FAKTOREN, CONFIG,
    )
    const tw = s.totalschaden!.totalschadenWeg
    expect(tw.positionen.some((p) => p.typ === 'mietwagen')).toBe(true)
    expect(tw.positionen.some((p) => p.typ === 'nutzungsausfall')).toBe(false)
  })
})
