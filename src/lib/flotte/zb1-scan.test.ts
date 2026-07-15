import { describe, it, expect, vi } from 'vitest'
const ocrMock = vi.fn()
vi.mock('@/lib/ocr/zb1-parser', () => ({ runZB1Ocr: (...a: unknown[]) => ocrMock(...a) }))
import { scanZb1FuerFlotte } from './zb1-scan'

// db-Mock: FIN-Dup-Check (maybeSingle) + firmen.name (maybeSingle)
function makeDb(finVorhanden: boolean, firmaName: string | null) {
  return {
    from: (t: string) => t === 'firmen'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: firmaName ? { name: firmaName } : null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: finVorhanden ? { vehicle_id: 'v1' } : null }) }) }) }) },
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
  it('Halter weicht ab -> halterWarnung', async () => {
    ocrMock.mockResolvedValue({ fullText: 'x', extracted: extracted('WBA12345678901234', 'Mueller') })
    const r = await scanZb1FuerFlotte(makeDb(false, 'Schmidt Logistik GmbH'), 'b64', 'f1')
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
})
