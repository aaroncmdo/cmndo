import { describe, it, expect } from 'vitest'
import { qualifiziertFuerGewinnspiel } from './qualifikation'

describe('qualifiziertFuerGewinnspiel', () => {
  it('qualifiziert bei schuldfrage=gegner mit Telefon', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'gegner' })
    expect(r.qualifiziert).toBe(true)
    expect(r.telefonNormalisiert).toBe('+491751234567')
  })

  it('qualifiziert bei schuldEinschaetzung=unverschuldet', () => {
    const r = qualifiziertFuerGewinnspiel({
      telefon: '+491751234567',
      schuldEinschaetzung: 'unverschuldet',
    })
    expect(r.qualifiziert).toBe(true)
  })

  it('lehnt ohne Telefonnummer ab', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: null, schuldfrage: 'gegner' })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('keine_telefonnummer')
  })

  it('lehnt bei Eigenverschulden ab', () => {
    const r = qualifiziertFuerGewinnspiel({
      telefon: '0175 1234567',
      schuldfrage: 'eigenverantwortung',
    })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('kein_haftpflichtschaden')
  })

  it('lehnt bei unklarer Schuldfrage ab', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'unklar' })
    expect(r.qualifiziert).toBe(false)
  })

  it('lehnt bei nicht_sicher ab', () => {
    const r = qualifiziertFuerGewinnspiel({
      telefon: '0175 1234567',
      schuldEinschaetzung: 'nicht_sicher',
    })
    expect(r.qualifiziert).toBe(false)
  })

  it('lehnt ab, wenn beide Felder fehlen', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567' })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('kein_haftpflichtschaden')
  })

  it('behandelt teilschuld NICHT als Haftpflichtschaden', () => {
    // gutachter_finder_anfragen kennt 'teilschuld', leads nicht — und Teilschuld
    // ist kein reiner Haftpflichtschaden (anteilige Quote statt Vollersatz).
    const r = qualifiziertFuerGewinnspiel({ telefon: '0175 1234567', schuldfrage: 'teilschuld' })
    expect(r.qualifiziert).toBe(false)
  })

  it('normalisiert 00-Praefix korrekt', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '00491751234567', schuldfrage: 'gegner' })
    expect(r.telefonNormalisiert).toBe('+491751234567')
  })

  it('behandelt eine leere Telefon-Zeichenkette wie fehlend', () => {
    const r = qualifiziertFuerGewinnspiel({ telefon: '   ', schuldfrage: 'gegner' })
    expect(r.qualifiziert).toBe(false)
    expect(r.grund).toBe('keine_telefonnummer')
  })
})
