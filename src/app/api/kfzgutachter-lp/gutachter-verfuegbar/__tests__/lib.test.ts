// src/app/api/kfzgutachter-lp/gutachter-verfuegbar/__tests__/lib.test.ts
import { describe, it, expect } from 'vitest'
import {
  pointInRing,
  isClosedRing,
  isValidPolygon,
  extractStadt,
  firstInitial,
  isTestAccount,
  sample,
  isValidPlaceId,
} from '../_lib'

describe('isClosedRing', () => {
  it('akzeptiert closed ring mit ≥4 Punkten', () => {
    expect(
      isClosedRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    ).toBe(true)
  })
  it('lehnt offenes Polygon ab', () => {
    expect(
      isClosedRing([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBe(false)
  })
  it('lehnt < 4 Punkte ab', () => {
    expect(isClosedRing([[0, 0], [1, 1], [0, 0]])).toBe(false)
  })
})

describe('pointInRing — Ray-Casting', () => {
  // Quadrat (0,0)-(10,10)
  const square: number[][] = [
    [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
  ]
  it('Punkt innen → true', () => {
    expect(pointInRing([5, 5], square)).toBe(true)
  })
  it('Punkt außerhalb (rechts) → false', () => {
    expect(pointInRing([15, 5], square)).toBe(false)
  })
  it('Punkt außerhalb (unten) → false', () => {
    expect(pointInRing([5, -1], square)).toBe(false)
  })
  it('Ring nicht geschlossen → false (Defensive)', () => {
    expect(pointInRing([5, 5], [[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false)
  })

  // Realistische Köln-Isochrone (sehr vereinfacht)
  const koelnIso: number[][] = [
    [6.85, 50.90], [7.05, 50.90], [7.05, 51.00], [6.85, 51.00], [6.85, 50.90],
  ]
  it('Köln-Hauptbahnhof (6.96, 50.94) liegt in Köln-Iso', () => {
    expect(pointInRing([6.96, 50.94], koelnIso)).toBe(true)
  })
  it('Düsseldorf-Königsallee (6.78, 51.22) liegt NICHT in Köln-Iso', () => {
    expect(pointInRing([6.78, 51.22], koelnIso)).toBe(false)
  })
})

describe('isValidPolygon', () => {
  it('akzeptiert kanonisches GeoJSON-Polygon', () => {
    expect(isValidPolygon({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    })).toBe(true)
  })
  it('lehnt Legacy-Array<{lat,lng}> ab (Migration-Fix-Spuren)', () => {
    expect(isValidPolygon([{ lat: 50.9, lng: 6.96 }])).toBe(false)
  })
  it('lehnt null/undefined/string ab', () => {
    expect(isValidPolygon(null)).toBe(false)
    expect(isValidPolygon(undefined)).toBe(false)
    expect(isValidPolygon('Polygon')).toBe(false)
  })
  it('lehnt {type:Polygon} ohne coordinates ab', () => {
    expect(isValidPolygon({ type: 'Polygon' })).toBe(false)
  })
})

describe('extractStadt', () => {
  it('Standard-Adresse', () => {
    expect(extractStadt('Mediapark 5, 50670 Köln')).toBe('Köln')
  })
  it('Umlaut-Stadt', () => {
    expect(extractStadt('Königsallee 1, 40212 Düsseldorf')).toBe('Düsseldorf')
  })
  it('Bindestrich-Stadt', () => {
    expect(extractStadt('Hauptstr. 1, 47798 Krefeld-Uerdingen')).toBe('Krefeld-Uerdingen')
  })
  it('Fallback ohne PLZ', () => {
    expect(extractStadt('Hauptstr. 1, Köln')).toBe('Köln')
  })
  it('null-safe', () => {
    expect(extractStadt(null)).toBe(null)
    expect(extractStadt(undefined)).toBe(null)
    expect(extractStadt('')).toBe(null)
  })
})

describe('firstInitial', () => {
  it('Standard-Vorname → "M."', () => {
    expect(firstInitial('Max')).toBe('M.')
  })
  it('Umlaut-Vorname → "Ä."', () => {
    expect(firstInitial('Ärger')).toBe('Ä.')
  })
  it('null-safe', () => {
    expect(firstInitial(null)).toBe(null)
    expect(firstInitial('')).toBe(null)
    expect(firstInitial('   ')).toBe(null)
  })
})

describe('isTestAccount', () => {
  it('Test-Account erkannt', () => {
    expect(isTestAccount('Test Aaron Gutachter GmbH')).toBe(true)
    expect(isTestAccount('Smoke SV')).toBe(true)
    expect(isTestAccount('Demo Gutachter GbR')).toBe(true)
  })
  it('Substring "test" als Teil eines Wortes → nicht erkannt', () => {
    expect(isTestAccount('Westend Sachverständige')).toBe(false)
    expect(isTestAccount('Testfeld Gutachter')).toBe(false)
  })
  it('null-safe', () => {
    expect(isTestAccount(null)).toBe(false)
    expect(isTestAccount('')).toBe(false)
  })
})

describe('sample', () => {
  it('arr.length ≤ n → komplette Kopie', () => {
    const arr = [1, 2]
    const result = sample(arr, 3)
    expect(result).toEqual([1, 2])
    expect(result).not.toBe(arr) // Kopie, keine Referenz
  })
  it('deterministischer rng → reproduzierbares Sample', () => {
    // RNG-Stub: liefert immer 0 → Fisher-Yates tauscht jedes Element
    // mit copy[0]. Für [1,2,3,4,5] ergibt das nach 4 Iterationen
    // [2,3,4,5,1], slice(0,2) = [2,3]. Wichtig ist nur die
    // Reproduzierbarkeit — bei festem rng kommt immer dasselbe raus.
    const rng = () => 0
    const first = sample([1, 2, 3, 4, 5], 2, rng)
    const second = sample([1, 2, 3, 4, 5], 2, rng)
    expect(first).toEqual([2, 3])
    expect(second).toEqual(first)
  })
  it('anderer rng → anderes Sample', () => {
    // rng=() => 0.999 → j=i (kein Swap), copy bleibt [1,2,3,4,5]
    const rng = () => 0.999
    expect(sample([1, 2, 3, 4, 5], 2, rng)).toEqual([1, 2])
  })
  it('mutiert Original nicht', () => {
    const original = [1, 2, 3, 4, 5]
    sample(original, 3)
    expect(original).toEqual([1, 2, 3, 4, 5])
  })
})

describe('isValidPlaceId', () => {
  it('akzeptiert echte Place-IDs (ChIJ-Format)', () => {
    expect(isValidPlaceId('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(true)
  })
  it('lehnt SQL-Injection / Markup ab', () => {
    expect(isValidPlaceId("'; DROP TABLE")).toBe(false)
    expect(isValidPlaceId('<script>')).toBe(false)
  })
  it('lehnt zu kurze ab', () => {
    expect(isValidPlaceId('short')).toBe(false)
  })
  it('lehnt zu lange ab', () => {
    expect(isValidPlaceId('a'.repeat(129))).toBe(false)
  })
})
