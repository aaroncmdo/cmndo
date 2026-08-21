import { describe, expect, it } from 'vitest'
import { normalisiereGemeindename, ordneStaedteZu, plausibel } from './ags-zuordnung.mjs'

// ---------------------------------------------------------------------------
// Bruecke Stadt -> amtlicher Gemeindeschluessel (AGS).
//
// WOFUER: JEDE amtliche Quelle (KBA-Fahrzeugbestand, Unfallatlas, Destatis)
// schluesselt auf den 8-stelligen AGS. Unsere Staedte haben nur slug/name/lat/lng.
// Ohne diese Bruecke ist keine davon nutzbar — das war bei der Unfallatlas-
// Pruefung (19.08.) der offene Punkt.
//
// Die Namensschreibweise des KBA ist eigen: GROSS, Umlaute aufgeloest, mit
// Verwaltungszusaetzen. Ein naiver Vergleich trifft fast nichts.
// ---------------------------------------------------------------------------
describe('normalisiereGemeindename', () => {
  it('loest Umlaute wie das KBA auf', () => {
    expect(normalisiereGemeindename('Hürth')).toBe(normalisiereGemeindename('HUERTH'))
    expect(normalisiereGemeindename('Mönchengladbach')).toBe('MOENCHENGLADBACH')
    expect(normalisiereGemeindename('Gütersloh')).toBe('GUETERSLOH')
  })

  it('streift Verwaltungszusaetze ab', () => {
    for (const [kba, klar] of [
      ['BOEBLINGEN,ST.', 'Böblingen'],
      ['STUTTGART,LANDESHAUPTSTADT', 'Stuttgart'],
      ['LUEBECK,HANSESTADT', 'Lübeck'],
      ['SIEGEN,UNIVERSITAETSSTADT', 'Siegen'],
      ['EUSKIRCHEN,ST.', 'Euskirchen'],
    ]) {
      expect(normalisiereGemeindename(kba)).toBe(normalisiereGemeindename(klar))
    }
  })

  it('vereinheitlicht Klammerzusaetze und Bindestriche', () => {
    expect(normalisiereGemeindename('Stolberg (Rhld.)')).toBe(normalisiereGemeindename('STOLBERG'))
    expect(normalisiereGemeindename('Bergisch Gladbach')).toBe(normalisiereGemeindename('BERGISCH-GLADBACH'))
  })

  it('macht NICHT zwei verschiedene Orte gleich', () => {
    // Die Normalisierung darf nicht so grob werden, dass Neuss und Neuß‑artige
    // Namen kollabieren — sonst trifft der Abgleich den falschen Ort.
    expect(normalisiereGemeindename('Neuss')).not.toBe(normalisiereGemeindename('Neuwied'))
    expect(normalisiereGemeindename('Bonn')).not.toBe(normalisiereGemeindename('Bornheim'))
  })
})

describe('plausibel', () => {
  it('akzeptiert normale Motorisierung', () => {
    expect(plausibel(36_636, 62_000)).toBe(true) // Huerth, real
    expect(plausibel(501_926, 1_100_000)).toBe(true) // Koeln, real
  })

  it('lehnt einen Fehlgriff auf eine Kleinstadt ab', () => {
    // Traefe der Abgleich statt Bonn (330 Tsd.) ein gleichnamiges Dorf, waere
    // die Quote absurd niedrig — genau daran erkennt man den Fehlgriff.
    expect(plausibel(1_200, 330_000)).toBe(false)
  })

  it('meldet auch AUFFAELLIG HOHE Werte', () => {
    // Wolfsburg hat real 1,01 Pkw je Einwohner (VW-Werksflotte). Das ist kein
    // Fehler, aber es MUSS auffallen — sonst kann man einen echten Fehlgriff
    // nicht davon unterscheiden.
    expect(plausibel(126_648, 125_000)).toBe(false)
  })

  it('vertraegt fehlende Einwohnerzahl, ohne zu behaupten', () => {
    expect(plausibel(1000, 0)).toBe(false)
  })
})

describe('ordneStaedteZu', () => {
  const GEMEINDEN = [
    { ags: '05362028', name: 'HUERTH,ST.', pkw: 36_636 },
    { ags: '05315000', name: 'KOELN,STADT', pkw: 501_926 },
    { ags: '09999999', name: 'HUERTH', pkw: 300 }, // gleichnamiges Dorf
  ]

  it('waehlt bei Namensgleichheit den Ort mit passender Groesse', () => {
    const r = ordneStaedteZu([{ slug: 'huerth', name: 'Hürth', einwohner: 62_000 }], GEMEINDEN)
    expect(r.treffer.huerth.ags).toBe('05362028')
  })

  it('meldet Staedte ohne Treffer, statt sie stillschweigend zu verlieren', () => {
    const r = ordneStaedteZu([{ slug: 'gibtsnicht', name: 'Atlantis', einwohner: 1000 }], GEMEINDEN)
    expect(r.treffer.gibtsnicht).toBeUndefined()
    expect(r.ohneTreffer).toEqual(['gibtsnicht'])
  })

  it('markiert unplausible Treffer, ohne sie zu verwerfen', () => {
    // Verwerfen waere falsch: Wolfsburg ist echt. Der Mensch entscheidet.
    const r = ordneStaedteZu(
      [{ slug: 'wolfsburg', name: 'Wolfsburg', einwohner: 125_000 }],
      [{ ags: '03103000', name: 'WOLFSBURG', pkw: 126_648 }],
    )
    expect(r.treffer.wolfsburg.ags).toBe('03103000')
    expect(r.auffaellig.map((a) => a.slug)).toEqual(['wolfsburg'])
  })

  it('nutzt einen Override vor dem Namensabgleich', () => {
    // Vier Staedte (hamburg, ludwigshafen, muelheim-an-der-ruhr,
    // monheim-am-rhein) schreibt das KBA so anders, dass kein Abgleich greift.
    const r = ordneStaedteZu(
      [{ slug: 'hamburg', name: 'Hamburg', einwohner: 1_900_000 }],
      [{ ags: '02000000', name: 'HAMBURG,FREIE UND HANSESTADT', pkw: 800_000 }],
      { hamburg: '02000000' },
    )
    expect(r.treffer.hamburg.ags).toBe('02000000')
    expect(r.ohneTreffer).toEqual([])
  })
})
