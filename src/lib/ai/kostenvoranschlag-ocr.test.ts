import { describe, it, expect } from 'vitest'
import { parseKvaOcrResponse } from './kostenvoranschlag-ocr'

describe('parseKvaOcrResponse', () => {
  it('parst JSON + normalisiert deutsche Betraege', () => {
    const raw = 'Hier das Ergebnis:\n{"kostenvoranschlag_netto":"3.245,67","kostenvoranschlag_brutto":"3.862,35","fahrzeug_hersteller":"BMW","fahrzeug_modell":"320d","kennzeichen":"K-AB 123","fin":"WBA1234567890","erstzulassung":"2019-03-01","fahrzeug_baujahr":2019,"halter_vorname":"Max","halter_nachname":"Mustermann","halter_strasse":"Hauptstr. 1","halter_plz":"50667","halter_ort":"Köln","telefon":"+49170123"}'
    const r = parseKvaOcrResponse(raw)
    expect(r.kostenvoranschlag_netto).toBe(3245.67)
    expect(r.kostenvoranschlag_brutto).toBe(3862.35)
    expect(r.fahrzeug_hersteller).toBe('BMW')
    expect(r.fahrzeug_baujahr).toBe(2019)
    expect(r.halter_ort).toBe('Köln')
  })

  it('fehlende Felder -> null; kein JSON -> alles null', () => {
    expect(parseKvaOcrResponse('{"kostenvoranschlag_brutto":1000}').kostenvoranschlag_netto).toBeNull()
    expect(parseKvaOcrResponse('keine daten').kostenvoranschlag_brutto).toBeNull()
    expect(parseKvaOcrResponse('keine daten').fahrzeug_hersteller).toBeNull()
  })
})
