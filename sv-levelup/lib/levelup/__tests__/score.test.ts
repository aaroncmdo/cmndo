import { describe, expect, it } from 'vitest'
import { berechneScore } from '../score'
import { istGueltig } from '../messwert'

describe('Score und Teilbefund', () => {
  it('rechnet den Score auf die erhebbaren Punkte, nicht auf die Gesamtpunkte', () => {
    expect(berechneScore(58, 116)).toEqual({ score: 50, keinScore: false })
  })

  it('gibt bei Weg B ohne Ads-/Meta-Konto und ohne GSC einen Score aus', () => {
    // 150 - 14 (kwg) - 8 (kwm) - 12 (gsc) = 116
    expect(berechneScore(40, 116).keinScore).toBe(false)
  })

  it('gibt bei Weg A ohne Website einen Score aus', () => {
    // 80 erhebbar, knapp ueber der Schwelle von 75
    expect(berechneScore(30, 80).keinScore).toBe(false)
  })

  it('verweigert den Score beim Massenlauf-Teilbefund', () => {
    // web 12 + seo 12 + ux 12 + verz 12 = 48 -> unter 75
    expect(berechneScore(20, 48)).toEqual({ score: null, keinScore: true })
  })

  it('verweigert den Score bei vier Modulen mit 10 Punkten (T-04)', () => {
    expect(berechneScore(4, 10)).toEqual({ score: null, keinScore: true })
  })

  it('gibt bei genau der Schwelle noch einen Score aus', () => {
    expect(berechneScore(50, 75).keinScore).toBe(false)
  })

  it('faengt punkteErhebbar = 0 ab, statt durch null zu teilen', () => {
    expect(berechneScore(0, 0)).toEqual({ score: null, keinScore: true })
  })
})

describe('Messwert-Validator (R-A, R-B)', () => {
  it('nimmt einen Befund mit Quelle und Erhebungsdatum an', () => {
    expect(istGueltig({ status: 'ok', wert: 154, quelle: 'Google Maps', erhoben: '2026-08-12' })).toBe(true)
  })

  it('verwirft einen Befund ohne Quelle (T-08)', () => {
    expect(istGueltig({ status: 'ok', wert: 154, erhoben: '2026-08-12' })).toBe(false)
  })

  it('verwirft einen Befund ohne Erhebungsdatum', () => {
    expect(istGueltig({ status: 'ok', wert: 154, quelle: 'Google Maps' })).toBe(false)
  })

  it('verlangt bei nicht_erhebbar einen Grund (T-09)', () => {
    expect(istGueltig({ status: 'nicht_erhebbar', wert: null, quelle: 'Keyword-Planer', erhoben: null })).toBe(false)
    expect(istGueltig({ status: 'nicht_erhebbar', wert: null, grund: 'Google-Ads-Konto fehlt', quelle: 'Keyword-Planer', erhoben: null })).toBe(true)
  })

  it('verwirft wert 0 im Zustand nicht_erhebbar — fehlt ist nicht null', () => {
    expect(istGueltig({ status: 'nicht_erhebbar', wert: 0, grund: 'x', quelle: 'y', erhoben: null })).toBe(false)
  })

  it('verwirft Unsinn statt zu raten', () => {
    expect(istGueltig(null)).toBe(false)
    expect(istGueltig('154')).toBe(false)
    expect(istGueltig({ status: 'irgendwas', wert: 1, quelle: 'q', erhoben: 'd' })).toBe(false)
  })
})
