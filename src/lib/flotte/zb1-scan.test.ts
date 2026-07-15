import { describe, it, expect, vi } from 'vitest'
const ocrMock = vi.fn()
vi.mock('@/lib/ocr/zb1-parser', () => ({ runZB1Ocr: (...a: unknown[]) => ocrMock(...a) }))
import { scanZb1FuerFlotte } from './zb1-scan'

// db-Mock: FIN-Dup-Check (maybeSingle) + firmen.name (maybeSingle). `from` ist ein vi.fn(),
// damit Tests belegen koennen, dass der flotten_fahrzeuge-Query-Pfad NICHT getroffen wurde
// (Befund 2: ungueltige/fehlende FIN darf gar nicht erst queryen).
function makeDb(finVorhanden: boolean, firmaName: string | null) {
  return {
    from: vi.fn((t: string) => t === 'firmen'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: firmaName ? { name: firmaName } : null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: finVorhanden ? { vehicle_id: 'v1' } : null }) }) }) }) }),
  } as any
}
const extracted = (fin: string | null, halter = 'Schmidt Logistik') => ({
  kennzeichen: 'K-AA 1', erstzulassung: null, fahrzeug_baujahr: null, halter_nachname: halter, halter_vorname: null,
  halter_strasse: null, halter_plz: null, halter_stadt: null, fahrzeug_hersteller: 'BMW', fahrzeug_modell: '320d',
  fahrzeug_farbe: null, fin_vin: fin, hsn: '0005', tsn: 'ABC', brn: null, fahrzeugklasse: null,
})

describe('scanZb1FuerFlotte', () => {
  it('erkennt Confidence aus den 5 Kernfeldern', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234') }) // fin+hsn+tsn+kz = 4/5
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.confidence).toBeCloseTo(0.8)
  })
  it('FIN schon in der Flotte -> bereitsInFlotte', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234') })
    const r = await scanZb1FuerFlotte(makeDb(true, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.bereitsInFlotte).toBe(true)
  })
  it('FIN fehlt (null) -> bereitsInFlotte=false, kein Dup-Query', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted(null) })
    // finVorhanden=true, um zu beweisen dass selbst ein "Ja"-DB-Ergebnis nie erreicht wird --
    // der Guard muss VOR dem Query greifen (Befund 2).
    const db = makeDb(true, 'Schmidt Logistik GmbH')
    const r = await scanZb1FuerFlotte(db, 'b64', 'f1')
    expect(r.ok && r.ergebnis.bereitsInFlotte).toBe(false)
    expect(db.from).not.toHaveBeenCalledWith('flotten_fahrzeuge')
  })
  it('FIN ungueltig (5 Zeichen) -> bereitsInFlotte=false, kein Dup-Query', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('ABC12') })
    const db = makeDb(true, 'Schmidt Logistik GmbH')
    const r = await scanZb1FuerFlotte(db, 'b64', 'f1')
    expect(r.ok && r.ergebnis.bereitsInFlotte).toBe(false)
    expect(db.from).not.toHaveBeenCalledWith('flotten_fahrzeuge')
  })
  it('Halter weicht ab -> halterWarnung', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Mueller') })
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.halterWarnung).toBe(true)
  })
  it('Halter ist Fragment eines Wortes (Ott vs. Otto) -> halterWarnung trotzdem true', async () => {
    // Kern-Fix Befund 1: mit rohem includes() waere "otto spedition".includes("ott") === true
    // und die Warnung wuerde faelschlich ausbleiben. Der Token-Vergleich verlangt ein ganzes Wort.
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Ott') })
    const r = await scanZb1FuerFlotte(makeDb(false, 'Otto Spedition GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.halterWarnung).toBe(true)
  })
  it('Halter passt (fuzzy, Rechtsform ignoriert) -> keine Warnung', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Schmidt Logistik') })
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
    expect(r.ok && r.ergebnis.halterWarnung).toBe(false)
  })
  it('OCR-Fehler -> ok:false', async () => {
    ocrMock.mockResolvedValue({ error: 'Vision down', status: 502 })
    const r = await scanZb1FuerFlotte(makeDb(false, 'x'), 'b64', 'f1')
    expect(r.ok).toBe(false)
  })
  it('FIN-Dup-Query wirft (Netzwerk-Reject) -> fail-open bereitsInFlotte=false, kein Crash', async () => {
    // Befund 3: ein geworfener Fetch-Reject (nicht nur ein {error}-Objekt) darf den {ok}-Vertrag
    // nicht brechen -- der try/catch muss ihn abfangen und fail-open bleiben.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234') })
    const db = {
      from: vi.fn((t: string) => t === 'firmen'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Schmidt Logistik GmbH' } }) }) }) }
        : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('network down') } }) }) }) }),
    } as any
    const r = await scanZb1FuerFlotte(db, 'b64', 'f1')
    expect(r.ok).toBe(true)
    expect(r.ok && r.ergebnis.bereitsInFlotte).toBe(false)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
  it('firmen.name-Query wirft (Netzwerk-Reject) -> fail-open keine Halter-Warnung, kein Crash', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Mueller') })
    const db = {
      from: vi.fn((t: string) => t === 'firmen'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('network down') } }) }) }
        : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
    } as any
    const r = await scanZb1FuerFlotte(db, 'b64', 'f1')
    expect(r.ok).toBe(true)
    expect(r.ok && r.ergebnis.halterWarnung).toBe(false)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
