import { describe, expect, test } from 'vitest'
import { bewerteSchuldfrage } from '../quali-gate'

describe('bewerteSchuldfrage — Policy "nur Eigenverschulden disqualifiziert"', () => {
  test('eigenverantwortung → abbruch (kein Termin)', () => {
    expect(bewerteSchuldfrage('eigenverantwortung')).toBe('abbruch')
  })

  test('gegner → weiter (sauberer Fall)', () => {
    expect(bewerteSchuldfrage('gegner')).toBe('weiter')
  })

  test('unklar → weiter_mit_flag (Termin erlaubt, Dispatcher-Flag)', () => {
    expect(bewerteSchuldfrage('unklar')).toBe('weiter_mit_flag')
  })

  test('unbekannter Wert → weiter_mit_flag (nur Eigenverschulden blockt, Anomalie geflaggt)', () => {
    expect(bewerteSchuldfrage('voellig_anderer_wert')).toBe('weiter_mit_flag')
  })

  test('null / undefined / leer → weiter_mit_flag (nicht Eigenverschulden → kein harter Block)', () => {
    expect(bewerteSchuldfrage(null)).toBe('weiter_mit_flag')
    expect(bewerteSchuldfrage(undefined)).toBe('weiter_mit_flag')
    expect(bewerteSchuldfrage('')).toBe('weiter_mit_flag')
  })

  test('NUR eigenverantwortung fuehrt jemals zu abbruch', () => {
    const werte = ['gegner', 'unklar', 'teilschuld', 'mitverschulden', '', 'x']
    for (const w of werte) {
      expect(bewerteSchuldfrage(w)).not.toBe('abbruch')
    }
  })
})
