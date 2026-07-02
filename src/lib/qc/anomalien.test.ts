import { describe, it, expect } from 'vitest'
import { berechneGutachtenAnomalien, type GutachtenAnomalieInput } from './anomalien'

// Filmcheck QC-Anomalie-Erkennung (02.07., Aaron-DEFAULT-Regelset). Reine Logik ueber
// die flachen OCR-Werte am gutachten. Jede Regel feuert NUR wenn ihre Inputs non-null
// sind — nie auf fehlenden Daten warnen. Warnung vs Hinweis siehe PR-Body.

// Vollstaendig plausibler Basis-Datensatz (keine Anomalie).
const OK: GutachtenAnomalieInput = {
  reparaturkosten_netto: 3000,
  wiederbeschaffungswert: 10000,
  restwert: 2000,
  minderwert: 500,
  totalschaden: false,
  gutachten_fin: 'WVWZZZ1KZAW000123', // exakt 17 Zeichen
}

const codes = (w: GutachtenAnomalieInput) => berechneGutachtenAnomalien(w).map((a) => a.code)

describe('berechneGutachtenAnomalien', () => {
  it('plausibler Datensatz -> keine Anomalie', () => {
    expect(berechneGutachtenAnomalien(OK)).toEqual([])
  })

  it('alle Felder null -> keine Anomalie (nie auf fehlenden Daten warnen)', () => {
    expect(
      berechneGutachtenAnomalien({
        reparaturkosten_netto: null,
        wiederbeschaffungswert: null,
        restwert: null,
        minderwert: null,
        totalschaden: null,
        gutachten_fin: null,
      }),
    ).toEqual([])
  })

  // Regel 1 (warnung): Reparaturkosten > WBW und NICHT als Totalschaden markiert.
  it('reparatur_ueber_wbw: reparaturkosten_netto > wiederbeschaffungswert AND totalschaden !== true -> warnung', () => {
    const r = berechneGutachtenAnomalien({ ...OK, reparaturkosten_netto: 12000, totalschaden: false })
    const a = r.find((x) => x.code === 'reparatur_ueber_wbw')
    expect(a).toBeDefined()
    expect(a?.schwere).toBe('warnung')
    expect(a?.text).toContain('Totalschaden')
  })

  it('reparatur_ueber_wbw: feuert NICHT wenn als Totalschaden markiert (totalschaden === true)', () => {
    expect(
      codes({ ...OK, reparaturkosten_netto: 12000, totalschaden: true, restwert: 2000 }),
    ).not.toContain('reparatur_ueber_wbw')
  })

  it('reparatur_ueber_wbw: feuert auch wenn totalschaden === null (nicht markiert)', () => {
    expect(codes({ ...OK, reparaturkosten_netto: 12000, totalschaden: null })).toContain('reparatur_ueber_wbw')
  })

  it('reparatur_ueber_wbw: feuert NICHT bei fehlenden Inputs (reparaturkosten ODER wbw null)', () => {
    expect(codes({ ...OK, reparaturkosten_netto: null })).not.toContain('reparatur_ueber_wbw')
    expect(codes({ ...OK, wiederbeschaffungswert: null, reparaturkosten_netto: 12000 })).not.toContain(
      'reparatur_ueber_wbw',
    )
  })

  it('reparatur_ueber_wbw: gleich (nicht groesser) -> keine Anomalie', () => {
    expect(codes({ ...OK, reparaturkosten_netto: 10000, wiederbeschaffungswert: 10000 })).not.toContain(
      'reparatur_ueber_wbw',
    )
  })

  // Regel 2 (warnung): FIN vorhanden aber getrimmt nicht 17 Zeichen.
  it('fin_nicht_17: FIN vorhanden AND getrimmte Laenge !== 17 -> warnung', () => {
    const a = berechneGutachtenAnomalien({ ...OK, gutachten_fin: 'ABC123' }).find((x) => x.code === 'fin_nicht_17')
    expect(a).toBeDefined()
    expect(a?.schwere).toBe('warnung')
  })

  it('fin_nicht_17: exakt 17 Zeichen -> keine Anomalie', () => {
    expect(codes({ ...OK, gutachten_fin: 'WVWZZZ1KZAW000123' })).not.toContain('fin_nicht_17')
  })

  it('fin_nicht_17: wird getrimmt (17 Zeichen mit Whitespace ist ok)', () => {
    expect(codes({ ...OK, gutachten_fin: '  WVWZZZ1KZAW000123  ' })).not.toContain('fin_nicht_17')
  })

  it('fin_nicht_17: feuert NICHT bei null/leer (nicht auf fehlenden Daten warnen)', () => {
    expect(codes({ ...OK, gutachten_fin: null })).not.toContain('fin_nicht_17')
    expect(codes({ ...OK, gutachten_fin: '   ' })).not.toContain('fin_nicht_17')
  })

  // Regel 3 (warnung): Restwert > WBW.
  it('restwert_ueber_wbw: restwert > wiederbeschaffungswert -> warnung', () => {
    const a = berechneGutachtenAnomalien({ ...OK, restwert: 12000 }).find((x) => x.code === 'restwert_ueber_wbw')
    expect(a).toBeDefined()
    expect(a?.schwere).toBe('warnung')
  })

  it('restwert_ueber_wbw: feuert NICHT bei fehlenden Inputs', () => {
    expect(codes({ ...OK, restwert: null })).not.toContain('restwert_ueber_wbw')
    expect(codes({ ...OK, wiederbeschaffungswert: null, restwert: 12000 })).not.toContain('restwert_ueber_wbw')
  })

  // Regel 4 (hinweis): Minderwert > WBW.
  it('minderwert_ueber_wbw: minderwert > wiederbeschaffungswert -> hinweis', () => {
    const a = berechneGutachtenAnomalien({ ...OK, minderwert: 12000 }).find((x) => x.code === 'minderwert_ueber_wbw')
    expect(a).toBeDefined()
    expect(a?.schwere).toBe('hinweis')
  })

  it('minderwert_ueber_wbw: feuert NICHT bei fehlenden Inputs', () => {
    expect(codes({ ...OK, minderwert: null })).not.toContain('minderwert_ueber_wbw')
  })

  // Regel 5 (hinweis): Totalschaden markiert aber kein Restwert.
  it('totalschaden_ohne_restwert: totalschaden === true AND restwert == null -> hinweis', () => {
    const a = berechneGutachtenAnomalien({ ...OK, totalschaden: true, restwert: null }).find(
      (x) => x.code === 'totalschaden_ohne_restwert',
    )
    expect(a).toBeDefined()
    expect(a?.schwere).toBe('hinweis')
  })

  it('totalschaden_ohne_restwert: feuert NICHT wenn Restwert vorhanden', () => {
    expect(codes({ ...OK, totalschaden: true, restwert: 0 })).not.toContain('totalschaden_ohne_restwert')
    expect(codes({ ...OK, totalschaden: true, restwert: 2000 })).not.toContain('totalschaden_ohne_restwert')
  })

  it('totalschaden_ohne_restwert: feuert NICHT wenn totalschaden !== true', () => {
    expect(codes({ ...OK, totalschaden: false, restwert: null })).not.toContain('totalschaden_ohne_restwert')
    expect(codes({ ...OK, totalschaden: null, restwert: null })).not.toContain('totalschaden_ohne_restwert')
  })

  // Umlaut-Pruefung: nutzersichtbare Texte muessen echte Umlaute enthalten (kein ae/oe/ue/ss).
  it('Texte nutzen echte Umlaute (keine ASCII-Ersatz-Sequenzen)', () => {
    const alle = berechneGutachtenAnomalien({
      reparaturkosten_netto: 12000,
      wiederbeschaffungswert: 10000,
      restwert: 11000,
      minderwert: 11000,
      totalschaden: true,
      gutachten_fin: 'ZUKURZ',
    })
    expect(alle.length).toBeGreaterThan(0)
    const text = alle.map((a) => a.text).join(' ')
    // Wenigstens ein echter Umlaut faellt in diesem Set an (uebersteigen/groesser/erforderlich/Zeichen).
    expect(/[äöüÄÖÜß]/.test(text)).toBe(true)
    // Kein typischer ASCII-Ersatz in den erwarteten Woertern.
    expect(text).not.toMatch(/uebersteig|groesser|unplausibel.*ss/i)
  })

  // Mehrere Regeln gleichzeitig.
  it('mehrere Anomalien gleichzeitig werden alle gemeldet', () => {
    const c = codes({
      reparaturkosten_netto: 15000,
      wiederbeschaffungswert: 10000,
      restwert: 12000,
      minderwert: 11000,
      totalschaden: false,
      gutachten_fin: 'KURZ',
    })
    expect(c).toContain('reparatur_ueber_wbw')
    expect(c).toContain('restwert_ueber_wbw')
    expect(c).toContain('minderwert_ueber_wbw')
    expect(c).toContain('fin_nicht_17')
    expect(c.length).toBe(4)
  })
})
