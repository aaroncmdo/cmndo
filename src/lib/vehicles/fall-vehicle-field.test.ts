import { describe, it, expect } from 'vitest'
import { FALL_VEHICLE_COL, fallVehicleWriteValue } from './fall-vehicle-field'

describe('FALL_VEHICLE_COL', () => {
  it('mappt die bestaetigten v_claim_full-veh-Felder', () => {
    expect(FALL_VEHICLE_COL.kennzeichen).toBe('kennzeichen_aktuell')
    expect(FALL_VEHICLE_COL.fahrzeug_hersteller).toBe('hersteller')
    expect(FALL_VEHICLE_COL.fahrzeug_modell).toBe('modell_haupttyp')
    expect(FALL_VEHICLE_COL.fahrzeug_typ).toBe('bauart')
    expect(FALL_VEHICLE_COL.fahrzeug_farbe).toBe('farbe_klartext')
    expect(FALL_VEHICLE_COL.lackfarbe_code).toBe('farbcode')
    expect(FALL_VEHICLE_COL.fin_vin).toBe('fin')
    expect(FALL_VEHICLE_COL.kilometerstand).toBe('aktueller_kilometerstand')
    expect(FALL_VEHICLE_COL.erstzulassung).toBe('erstzulassung')
    expect(FALL_VEHICLE_COL.fahrzeug_baujahr).toBe('baujahr_monat')
    expect(FALL_VEHICLE_COL.hsn).toBe('hsn')
    expect(FALL_VEHICLE_COL.tsn).toBe('tsn')
  })

  it('enthaelt die bewusst deferierten Felder NICHT (Aggregat/Name-Split/Value-Format)', () => {
    expect(FALL_VEHICLE_COL.ist_fahrzeughalter).toBeUndefined()
    expect(FALL_VEHICLE_COL.vorschaden_anzahl).toBeUndefined()
    expect(FALL_VEHICLE_COL.gegner_name).toBeUndefined()
  })
})

describe('fallVehicleWriteValue', () => {
  it('fahrzeug_baujahr: int Jahr -> baujahr_monat "<jahr>-01-01" (matcht v_claim_full EXTRACT(year))', () => {
    expect(fallVehicleWriteValue('fahrzeug_baujahr', 2020)).toEqual({ ok: true, value: '2020-01-01' })
    expect(fallVehicleWriteValue('fahrzeug_baujahr', '2018')).toEqual({ ok: true, value: '2018-01-01' })
  })

  it('fahrzeug_baujahr: ungueltiges Jahr -> Fehler', () => {
    expect(fallVehicleWriteValue('fahrzeug_baujahr', 1850).ok).toBe(false)
    expect(fallVehicleWriteValue('fahrzeug_baujahr', 3000).ok).toBe(false)
    expect(fallVehicleWriteValue('fahrzeug_baujahr', 'abc').ok).toBe(false)
  })

  it('kilometerstand: -> nicht-negative ganze Zahl', () => {
    expect(fallVehicleWriteValue('kilometerstand', '50000')).toEqual({ ok: true, value: 50000 })
    expect(fallVehicleWriteValue('kilometerstand', 12000)).toEqual({ ok: true, value: 12000 })
    expect(fallVehicleWriteValue('kilometerstand', -1).ok).toBe(false)
  })

  it('null = explizites Loeschen -> null (fuer alle Felder)', () => {
    expect(fallVehicleWriteValue('fahrzeug_baujahr', null)).toEqual({ ok: true, value: null })
    expect(fallVehicleWriteValue('kilometerstand', null)).toEqual({ ok: true, value: null })
    expect(fallVehicleWriteValue('fahrzeug_hersteller', null)).toEqual({ ok: true, value: null })
  })

  it('Text/Date-Felder werden durchgereicht (Postgres validiert)', () => {
    expect(fallVehicleWriteValue('fahrzeug_hersteller', 'BMW')).toEqual({ ok: true, value: 'BMW' })
    expect(fallVehicleWriteValue('kennzeichen', 'K-AB 1234')).toEqual({ ok: true, value: 'K-AB 1234' })
    expect(fallVehicleWriteValue('erstzulassung', '2020-03-15')).toEqual({ ok: true, value: '2020-03-15' })
  })
})
