import { describe, it, expect } from 'vitest'
import {
  resolveAbrechnungsweg,
  routeForAbrechnungsweg,
  istReparaturOnly,
  istWerkstattReparaturWeg,
  deriveAbrechnungsweg,
  qualiAusSchadensart,
} from '../abrechnungsweg'

describe('resolveAbrechnungsweg', () => {
  it('gegner -> haftpflicht (unabhaengig von der Versicherungsangabe)', () => {
    expect(resolveAbrechnungsweg({ schuldfrage: 'gegner', ueberEigeneVersicherung: null })).toBe('haftpflicht')
    expect(resolveAbrechnungsweg({ schuldfrage: 'gegner', ueberEigeneVersicherung: true })).toBe('haftpflicht')
    expect(resolveAbrechnungsweg({ schuldfrage: 'gegner', ueberEigeneVersicherung: false })).toBe('haftpflicht')
  })

  it('eigenverantwortung + eigene Versicherung -> kasko', () => {
    expect(
      resolveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: true }),
    ).toBe('kasko')
  })

  it('eigenverantwortung ohne eigene Versicherung -> selbstzahler', () => {
    expect(
      resolveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: false }),
    ).toBe('selbstzahler')
  })

  it('eigenverantwortung + Versicherungsfrage offen (null) -> null (Flow fragt nach)', () => {
    expect(
      resolveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', ueberEigeneVersicherung: null }),
    ).toBeNull()
  })

  it('schuldfrage null oder unbekannt -> null', () => {
    expect(resolveAbrechnungsweg({ schuldfrage: null, ueberEigeneVersicherung: true })).toBeNull()
    expect(resolveAbrechnungsweg({ schuldfrage: 'unklar', ueberEigeneVersicherung: false })).toBeNull()
  })
})

describe('routeForAbrechnungsweg', () => {
  it('mappt jeden Weg auf seine Route', () => {
    expect(routeForAbrechnungsweg('haftpflicht')).toBe('kanonisch')
    expect(routeForAbrechnungsweg('kasko')).toBe('kasko_hinweis')
    expect(routeForAbrechnungsweg('selbstzahler')).toBe('selbstzahler_reparatur')
  })
})

describe('istReparaturOnly', () => {
  it('nur selbstzahler ist reparatur-only', () => {
    expect(istReparaturOnly('selbstzahler')).toBe(true)
  })

  it('haftpflicht / kasko / null / unbekannt sind es nicht', () => {
    expect(istReparaturOnly('haftpflicht')).toBe(false)
    expect(istReparaturOnly('kasko')).toBe(false)
    expect(istReparaturOnly(null)).toBe(false)
    expect(istReparaturOnly('irgendwas')).toBe(false)
  })
})

describe('istWerkstattReparaturWeg (WS2 — selbstzahler ODER kasko-freie-Wahl)', () => {
  it('selbstzahler ist immer Werkstatt-Reparatur', () => {
    expect(istWerkstattReparaturWeg('selbstzahler')).toBe(true)
    expect(istWerkstattReparaturWeg('selbstzahler', false)).toBe(true)
  })
  it('kasko ist Werkstatt-Reparatur, ausser bei expliziter Werkstattbindung (false)', () => {
    expect(istWerkstattReparaturWeg('kasko', true)).toBe(true)
    expect(istWerkstattReparaturWeg('kasko', null)).toBe(true)
    expect(istWerkstattReparaturWeg('kasko')).toBe(true)
    expect(istWerkstattReparaturWeg('kasko', false)).toBe(false)
  })
  it('haftpflicht / null / unbekannt sind keine Werkstatt-Reparatur', () => {
    expect(istWerkstattReparaturWeg('haftpflicht')).toBe(false)
    expect(istWerkstattReparaturWeg(null)).toBe(false)
    expect(istWerkstattReparaturWeg('irgendwas')).toBe(false)
  })
})

describe('deriveAbrechnungsweg (spiegelt die DB-Funktion derive_abrechnungsweg, Mig 20260804161329)', () => {
  it('gegner -> haftpflicht (service-typ-unabhaengig — auch fuer nur_gutachter-Claims)', () => {
    expect(deriveAbrechnungsweg({ schuldfrage: 'gegner', eigeneVersicherung: null, schadenart: 'unbekannt' })).toBe('haftpflicht')
    expect(deriveAbrechnungsweg({ schuldfrage: 'gegner', eigeneVersicherung: 'ja', schadenart: null })).toBe('haftpflicht')
  })
  it('eigenverantwortung + eigene VS -> kasko / ohne -> selbstzahler / offen -> null', () => {
    expect(deriveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'ja', schadenart: null })).toBe('kasko')
    expect(deriveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'nein', schadenart: null })).toBe('selbstzahler')
    expect(deriveAbrechnungsweg({ schuldfrage: 'eigenverantwortung', eigeneVersicherung: null, schadenart: null })).toBeNull()
  })
  it('schadenart-Fallback: schuldfrage fehlt aber schadenart=haftpflicht -> haftpflicht', () => {
    expect(deriveAbrechnungsweg({ schuldfrage: null, eigeneVersicherung: null, schadenart: 'haftpflicht' })).toBe('haftpflicht')
  })
  it('sonst (schuldfrage null + schadenart != haftpflicht) -> null', () => {
    expect(deriveAbrechnungsweg({ schuldfrage: null, eigeneVersicherung: null, schadenart: 'unbekannt' })).toBeNull()
    expect(deriveAbrechnungsweg({ schuldfrage: 'unklar', eigeneVersicherung: null, schadenart: null })).toBeNull()
  })
  it('gibt NIE nicht_zutreffend — der nur_gutachter-Sonderfall ist entfernt (abrechnungsweg = Schaden-Natur)', () => {
    expect(deriveAbrechnungsweg({ schuldfrage: 'gegner', eigeneVersicherung: null, schadenart: 'unbekannt' })).not.toBe('nicht_zutreffend')
    expect(deriveAbrechnungsweg({ schuldfrage: null, eigeneVersicherung: null, schadenart: 'unbekannt' })).not.toBe('nicht_zutreffend')
  })
})

describe('qualiAusSchadensart (Fallback-Quali aus Versicherungs-Klassifikation)', () => {
  it('haftpflicht -> gegner', () => {
    expect(qualiAusSchadensart('haftpflicht')).toEqual({ schuldfrage: 'gegner', eigeneVersicherung: null })
  })
  it('vollkasko/teilkasko -> eigenverantwortung + eigene VS', () => {
    expect(qualiAusSchadensart('vollkasko')).toEqual({ schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'ja' })
    expect(qualiAusSchadensart('teilkasko')).toEqual({ schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'ja' })
  })
  it('eigenverschulden -> eigenverantwortung ohne VS', () => {
    expect(qualiAusSchadensart('eigenverschulden')).toEqual({ schuldfrage: 'eigenverantwortung', eigeneVersicherung: 'nein' })
  })
  it('unbekannt / null / undefined / unbekannter Wert -> null (Quali bleibt offen)', () => {
    expect(qualiAusSchadensart('unbekannt')).toBeNull()
    expect(qualiAusSchadensart(null)).toBeNull()
    expect(qualiAusSchadensart(undefined)).toBeNull()
    expect(qualiAusSchadensart('irgendwas')).toBeNull()
  })
  // E2E: die abgeleitete Quali muss durch resolveAbrechnungsweg den richtigen Weg geben — der Kern
  // des Fixes (Weg 6 /kunde/schaden-melden + Admin-Anlage erzeugen sonst abrechnungsweg=null).
  it('E2E: qualiAusSchadensart -> resolveAbrechnungsweg ergibt den erwarteten Weg', () => {
    const wegAus = (art: string) => {
      const q = qualiAusSchadensart(art)
      return resolveAbrechnungsweg({
        schuldfrage: q?.schuldfrage ?? null,
        ueberEigeneVersicherung: q?.eigeneVersicherung === 'ja' ? true : q?.eigeneVersicherung === 'nein' ? false : null,
      })
    }
    expect(wegAus('haftpflicht')).toBe('haftpflicht')
    expect(wegAus('vollkasko')).toBe('kasko')
    expect(wegAus('teilkasko')).toBe('kasko')
    expect(wegAus('eigenverschulden')).toBe('selbstzahler')
    expect(wegAus('unbekannt')).toBeNull()
  })
})
