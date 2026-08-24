import { describe, expect, it } from 'vitest'
import {
  spaltenIndizes, zahl, koordinate, distanzKm, leseZaehlstellen, waehleProStadt,
} from './bast-zaehlstellen.mjs'

// Ausschnitt der ECHTEN Kopfzeile (255 Spalten, am 21.08.2026 aus Jawe2024.csv).
// Gekuerzt auf die relevanten, Reihenfolge beibehalten.
const KOPF = 'TK_Nr;DZ_Nr;DZ_Name;Land_Nr;Land_Code;Str_Kl;Str_Nr;Koor_WGS84_N;Koor_WGS84_E;DTV_Kfz_MobisSo_Q;DTV_SV_MobisSo_Q'
const zeile = (o) => [
  '2426', o.nr ?? '2218', o.name ?? 'Leverkusen', '5', 'NW', o.kl ?? 'A', o.nr2 ?? '3',
  o.lat ?? '51,0459', o.lng ?? '6,9876', o.dtv ?? '171.135', o.sv ?? '20.500',
].join(';')

describe('spaltenIndizes', () => {
  it('findet die Spalten über Namen — 255 Indizes wären nicht zu raten', () => {
    const I = spaltenIndizes(KOPF)
    expect(I.DTV_Kfz_MobisSo_Q).toBe(9)
    expect(I.Koor_WGS84_N).toBe(7)
  })

  it('wirft, wenn die BASt das Format ändert', () => {
    expect(() => spaltenIndizes('TK_Nr;DZ_Nr;DZ_Name')).toThrow(/Str_Kl fehlt/)
  })
})

describe('zahl', () => {
  it('liest den deutschen Tausenderpunkt', () => {
    expect(zahl('171.135')).toBe(171135)
    expect(zahl('9.876')).toBe(9876)
  })

  it('gibt null für den LEEREN Wert — nicht 0', () => {
    // ⚠ Die Falle: 638 von 2.127 Zählstellen haben kein DTV. Als 0 gerendert
    // stünde „hier fahren täglich 0 Fahrzeuge" auf einer Stadtseite — eine
    // falsche Aussage, keine fehlende Angabe.
    expect(zahl('')).toBeNull()
    expect(zahl('   ')).toBeNull()
    expect(zahl(undefined)).toBeNull()
  })
})

describe('koordinate', () => {
  it('liest das deutsche Dezimalkomma', () => {
    expect(koordinate('51,0459')).toBeCloseTo(51.0459, 4)
  })

  it('gibt null statt NaN', () => {
    expect(koordinate('')).toBeNull()
    expect(koordinate('k.A.')).toBeNull()
  })
})

describe('distanzKm', () => {
  it('rechnet eine bekannte Strecke plausibel (Köln→Düsseldorf ≈ 35 km)', () => {
    const d = distanzKm(50.9375, 6.9603, 51.2277, 6.7735)
    expect(d).toBeGreaterThan(30)
    expect(d).toBeLessThan(42)
  })

  it('ist am selben Punkt null', () => {
    expect(distanzKm(50.9375, 6.9603, 50.9375, 6.9603)).toBeCloseTo(0, 5)
  })
})

describe('leseZaehlstellen', () => {
  it('liest eine vollständige Zeile', () => {
    const s = leseZaehlstellen([KOPF, zeile({})].join('\n'))
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ strasse: 'A3', dtv: 171135, schwerverkehr: 20500, name: 'Leverkusen' })
  })

  it('verwirft Zählstellen OHNE DTV-Wert', () => {
    const s = leseZaehlstellen([KOPF, zeile({ dtv: '' })].join('\n'))
    expect(s).toEqual([])
  })

  it('verwirft Zählstellen ohne Koordinate', () => {
    expect(leseZaehlstellen([KOPF, zeile({ lat: '' })].join('\n'))).toEqual([])
  })

  it('verwirft Koordinaten außerhalb Deutschlands', () => {
    expect(leseZaehlstellen([KOPF, zeile({ lat: '40,1' })].join('\n'))).toEqual([])
  })

  it('behält Zählstellen ohne Schwerverkehrswert (0 ist dort echt)', () => {
    // Anders als beim DTV: kein Schwerverkehr gemessen ≠ falsche Aussage,
    // die Zahl wird schlicht nicht genannt.
    const s = leseZaehlstellen([KOPF, zeile({ sv: '' })].join('\n'))
    expect(s).toHaveLength(1)
    expect(s[0].schwerverkehr).toBe(0)
  })
})

describe('waehleProStadt', () => {
  const koeln = { slug: 'koeln', lat: 50.9375, lng: 6.9603 }
  const stelle = (o) => ({ nr: '1', name: o.name ?? 'X', strasse: o.strasse, lat: o.lat, lng: o.lng, dtv: o.dtv ?? 100000, schwerverkehr: 0 })

  it('nimmt nur Zählstellen im Umkreis', () => {
    const weit = stelle({ strasse: 'A7', lat: 53.5, lng: 10.0 }) // Hamburg
    expect(waehleProStadt([koeln], [weit], 10, 2).koeln).toBeUndefined()
  })

  it('bevorzugt VERSCHIEDENE Straßen', () => {
    // Zwei Messpunkte derselben Autobahn sagen dem Leser nichts Neues.
    const s = waehleProStadt([koeln], [
      stelle({ strasse: 'A4', lat: 50.940, lng: 6.965 }),
      stelle({ strasse: 'A4', lat: 50.942, lng: 6.968 }),
      stelle({ strasse: 'A57', lat: 50.950, lng: 6.930 }),
    ], 10, 2).koeln
    expect(s.map((x) => x.strasse)).toEqual(['A4', 'A57'])
  })

  it('nimmt die nächstgelegene zuerst', () => {
    const s = waehleProStadt([koeln], [
      stelle({ strasse: 'A1', lat: 51.00, lng: 7.02 }),
      stelle({ strasse: 'A4', lat: 50.939, lng: 6.962 }),
    ], 15, 2).koeln
    expect(s[0].strasse).toBe('A4')
  })

  it('rechnet die Entfernung mit — sie gehört in die Aussage', () => {
    const s = waehleProStadt([koeln], [stelle({ strasse: 'A4', lat: 50.98, lng: 6.99 })], 10, 2).koeln
    expect(s[0].km).toBeGreaterThan(0)
    expect(s[0].km).toBeLessThan(10)
  })
})
