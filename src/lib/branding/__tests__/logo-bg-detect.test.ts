import { describe, it, expect } from 'vitest'
import {
  detectSolidBackground,
  nonBackgroundRatio,
  opaqueRatio,
  decideImglyOvercut,
  estimateForegroundReference,
} from '../logo-bg-detect'

// RGBA-Testbilder von Hand bauen (kein Canvas noetig -> die Kern-Logik ist
// deterministisch ueber flachen Byte-Arrays testbar).
function img(width: number, height: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return data
}
function setPx(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  px: [number, number, number, number],
): void {
  const i = (y * width + x) * 4
  data[i] = px[0]
  data[i + 1] = px[1]
  data[i + 2] = px[2]
  data[i + 3] = px[3]
}

describe('detectSolidBackground', () => {
  it('erkennt weissen soliden Hintergrund', () => {
    const d = img(8, 8, [255, 255, 255, 255])
    expect(detectSolidBackground(d, 8, 8, 4)).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('erkennt near-black Hintergrund', () => {
    const d = img(8, 8, [10, 10, 10, 255])
    expect(detectSolidBackground(d, 8, 8, 4)).toEqual({ r: 10, g: 10, b: 10 })
  })

  it('erkennt hellgrauen (light-uniform) Hintergrund', () => {
    const d = img(8, 8, [210, 210, 210, 255])
    expect(detectSolidBackground(d, 8, 8, 4)).toEqual({ r: 210, g: 210, b: 210 })
  })

  it('gibt null bei transparenter Ecke (echtes PNG-Padding)', () => {
    const d = img(8, 8, [255, 255, 255, 255])
    setPx(d, 8, 2, 2, [0, 0, 0, 0]) // Ecken-Sample-Punkt (2,2) transparent
    expect(detectSolidBackground(d, 8, 8, 4)).toBeNull()
  })

  it('gibt null bei nicht-uniformen Ecken', () => {
    const d = img(8, 8, [255, 255, 255, 255])
    setPx(d, 8, 2, 2, [255, 0, 0, 255]) // eine Ecke rot
    expect(detectSolidBackground(d, 8, 8, 4)).toBeNull()
  })

  it('gibt null bei saettigend-buntem uniformem Hintergrund (kein near-white/black/light)', () => {
    const d = img(8, 8, [50, 80, 200, 255]) // uniform blau
    expect(detectSolidBackground(d, 8, 8, 4)).toBeNull()
  })
})

describe('nonBackgroundRatio', () => {
  it('zaehlt Vordergrund-Pixel (RGB-Distanz > Threshold, sichtbar)', () => {
    const w = 8, h = 8
    const d = img(w, h, [255, 255, 255, 255])
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]] as const) setPx(d, w, x, y, [0, 0, 0, 255])
    expect(nonBackgroundRatio(d, w, h, 4, { r: 255, g: 255, b: 255 })).toBeCloseTo(4 / 64, 5)
  })

  it('ignoriert transparente Pixel', () => {
    const w = 8, h = 8
    const d = img(w, h, [255, 255, 255, 255])
    // schwarz aber transparent -> zaehlt NICHT als Vordergrund
    setPx(d, w, 3, 3, [0, 0, 0, 0])
    expect(nonBackgroundRatio(d, w, h, 4, { r: 255, g: 255, b: 255 })).toBe(0)
  })
})

describe('opaqueRatio', () => {
  it('zaehlt Pixel mit alpha >= cutoff', () => {
    const w = 8, h = 8
    const d = img(w, h, [0, 0, 0, 255])
    let cleared = 0
    for (let y = 0; y < h && cleared < 16; y++) {
      for (let x = 0; x < w && cleared < 16; x++) {
        setPx(d, w, x, y, [0, 0, 0, 0])
        cleared++
      }
    }
    expect(opaqueRatio(d, w, h, 4)).toBeCloseTo(48 / 64, 5)
  })
})

describe('decideImglyOvercut', () => {
  it('akzeptiert wenn imgly ~allen Vordergrund behaelt (retention 1.0)', () => {
    expect(decideImglyOvercut({ foregroundRatioBefore: 0.3, opaqueRatioAfter: 0.3 }).overcut).toBe(false)
  })

  it('verwirft wenn imgly zu viel gefressen hat (retention 0.3 < 0.55)', () => {
    const v = decideImglyOvercut({ foregroundRatioBefore: 0.3, opaqueRatioAfter: 0.09 })
    expect(v.overcut).toBe(true)
  })

  it('verwirft bei quasi-leerem Ergebnis (absolute floor)', () => {
    expect(decideImglyOvercut({ foregroundRatioBefore: 0.3, opaqueRatioAfter: 0.001 }).overcut).toBe(true)
  })

  it('akzeptiert wenn BG nicht messbar (fg=null) und Ergebnis gesund', () => {
    expect(decideImglyOvercut({ foregroundRatioBefore: null, opaqueRatioAfter: 0.4 }).overcut).toBe(false)
  })

  it('verwirft wenn BG nicht messbar (fg=null) aber Ergebnis quasi-leer', () => {
    expect(decideImglyOvercut({ foregroundRatioBefore: null, opaqueRatioAfter: 0.002 }).overcut).toBe(true)
  })

  it('Grenzfall: retention knapp ueber Threshold zaehlt NICHT als overcut', () => {
    // 0.12 / 0.20 = 0.60 >= 0.55 minRetention -> ok (nicht overcut)
    expect(decideImglyOvercut({ foregroundRatioBefore: 0.2, opaqueRatioAfter: 0.12 }).overcut).toBe(false)
  })
})

describe('estimateForegroundReference (3-Wege Retention-Referenz)', () => {
  it('basis=alpha: Original hat schon Transparenz -> Referenz = opaker Anteil', () => {
    const w = 8, h = 8
    const d = img(w, h, [0, 0, 0, 0]) // komplett transparent
    // 8 opake Pixel in der Mitte (Ecken bleiben transparent)
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4], [3, 5], [4, 5], [3, 6], [4, 6]] as const) {
      setPx(d, w, x, y, [0, 0, 0, 255])
    }
    const r = estimateForegroundReference(d, w, h, 4)
    expect(r.basis).toBe('alpha')
    expect(r.ref).toBeCloseTo(8 / 64, 5)
  })

  it('basis=solid-bg: weisser BG -> Referenz = nonBackgroundRatio', () => {
    const w = 8, h = 8
    const d = img(w, h, [255, 255, 255, 255])
    for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]] as const) setPx(d, w, x, y, [0, 0, 0, 255])
    const r = estimateForegroundReference(d, w, h, 4)
    expect(r.basis).toBe('solid-bg')
    expect(r.ref).toBeCloseTo(4 / 64, 5)
  })

  it('basis=none: opaker nicht-solider (bunter) BG -> kein Urteil (null)', () => {
    const d = img(8, 8, [50, 80, 200, 255]) // uniform blau, opak
    const r = estimateForegroundReference(d, 8, 8, 4)
    expect(r.basis).toBe('none')
    expect(r.ref).toBeNull()
  })
})
