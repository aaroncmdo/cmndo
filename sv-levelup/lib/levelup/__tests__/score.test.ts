import { describe, expect, it } from 'vitest'
import { berechneScore } from '../score'
import { istGueltig } from '../messwert'
import { TEILBEFUND_SCHWELLE } from '../registry'

describe('Score und Teilbefund', () => {
  it('rechnet den Score auf die erhebbaren Punkte, nicht auf die Gesamtpunkte', () => {
    expect(berechneScore(58, 116)).toEqual({ score: 50, keinScore: false })
  })

  it('gibt bei Weg B ohne Ads-/Meta-Konto und ohne GSC einen Score aus', () => {
    // 160 - 14 (kwg) - 8 (kwm) - 12 (gsc) = 126
    expect(berechneScore(40, 126).keinScore).toBe(false)
  })

  it('gibt bei Weg A ohne Website einen Score aus', () => {
    // 90 erhebbar, ueber der Schwelle
    expect(berechneScore(30, 90).keinScore).toBe(false)
  })

  it('verweigert den Score beim Massenlauf-Teilbefund', () => {
    // web 12 + seo 12 + ux 12 + verz 12 = 48 -> unter der Schwelle
    expect(berechneScore(20, 48)).toEqual({
      score: null, keinScore: true, grund: 'zu_wenig_umfang',
    })
  })

  it('verweigert den Score bei vier Modulen mit 10 Punkten (T-04)', () => {
    expect(berechneScore(4, 10)).toEqual({
      score: null, keinScore: true, grund: 'zu_wenig_umfang',
    })
  })

  it('gibt bei genau der Schwelle noch einen Score aus', () => {
    // ⚠ An die Konstante gebunden: die Schwelle ist die Haelfte der
    // Modulpunkte und wandert mit jedem neuen Modul. Eine abgeschriebene Zahl
    // wuerde hier nicht die Grenze pruefen, sondern eine von gestern.
    expect(berechneScore(50, TEILBEFUND_SCHWELLE).keinScore).toBe(false)
    expect(berechneScore(50, TEILBEFUND_SCHWELLE - 1).keinScore).toBe(true)
  })

  it('faengt punkteErhebbar = 0 ab, statt durch null zu teilen', () => {
    expect(berechneScore(0, 0)).toEqual({
      score: null, keinScore: true, grund: 'zu_viel_ungemessen',
    })
  })
})

/**
 * Der Fall, der diese Aenderung ausgeloest hat (25.08.2026).
 *
 * An echten Checks gemessen: drei Laeufe mit IDENTISCHER Modulliste hatten
 * 116, 74 und 57 erhebbare Punkte — je nachdem, wie viele Module unterwegs
 * scheiterten. Nur der erste bekam einen Score. Bestraft wurde der Nutzer fuer
 * Fehlstellen, auf die er keinen Einfluss hat.
 */
describe('Umfang und Messquote getrennt', () => {
  const GEWAEHLT = 116

  it('gibt einen Score, wenn genug gewaehlt UND genug gemessen wurde', () => {
    // 74 von 116 gemessen = 64 % — heute ohne Score, kuenftig mit.
    const r = berechneScore(37, 74, GEWAEHLT)
    expect(r.keinScore).toBe(false)
    expect(r.score).toBe(50) // 37 von 74, nicht von 116
  })

  it('rechnet weiterhin auf das GEMESSENE, nicht auf das Gewaehlte', () => {
    // ⚠ Der Nenner bleibt der gemessene Wert (R-B). Wer auf das Gewaehlte
    // normierte, zaehlte nicht Gemessenes als nicht erreicht.
    expect(berechneScore(37, 74, GEWAEHLT).score).toBe(50)
    expect(berechneScore(37, 116, GEWAEHLT).score).toBe(32)
  })

  it('verweigert den Score, wenn ueber die Haelfte nicht gemessen werden konnte', () => {
    // 57 von 116 = 49 % — zu duenn, um daraus einen Prozentwert zu machen.
    expect(berechneScore(28, 57, GEWAEHLT)).toEqual({
      score: null, keinScore: true, grund: 'zu_viel_ungemessen',
    })
  })

  it('unterscheidet die beiden Gruende', () => {
    // Zu wenig gewaehlt — sauber gemessen, aber ohne Aussagekraft.
    expect(berechneScore(15, 30, 30).grund).toBe('zu_wenig_umfang')
    // Genug gewaehlt, zu wenig davon messbar.
    expect(berechneScore(10, 20, GEWAEHLT).grund).toBe('zu_viel_ungemessen')
  })

  it('bleibt ohne dritten Wert beim alten Verhalten', () => {
    // Wo nichts scheiterte, sind gewaehlt und erhebbar gleich.
    expect(berechneScore(58, 116).score).toBe(50)
    expect(berechneScore(58, 116, 116).score).toBe(50)
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
