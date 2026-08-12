import { describe, it, expect } from 'vitest'
import { snapshotToVehicleUpdate } from '../snapshot-update'

describe('snapshotToVehicleUpdate', () => {
  it('mappt die Kern-Identitaet auf die vehicles-Spaltennamen', () => {
    const u = snapshotToVehicleUpdate({
      kennzeichen: 'K-AB 123',
      hersteller: 'Fiat',
      modell: '500',
      hsn: '4136',
      tsn: 'ABC',
    })
    expect(u).toEqual({
      kennzeichen_aktuell: 'K-AB 123',
      hersteller: 'Fiat',
      modell_haupttyp: '500',
      hsn: '4136',
      tsn: 'ABC',
    })
  })

  it('mappt die Restfelder inkl. Datums-Normalisierung', () => {
    const u = snapshotToVehicleUpdate({
      farbe: 'blau',
      erstzulassung: '14.01.2018',
      baujahr: 2018,
    })
    expect(u.farbe_klartext).toBe('blau')
    expect(u.erstzulassung).toBe('2018-01-14')
    expect(u.baujahr_monat).toBe('2018-01-01')
  })

  // Kern der B1-Entscheidung (Aaron: nachziehen statt sperren): der Nachzug darf
  // bestehende vehicles-Daten NICHT mit null ueberschreiben, nur gesetzte Werte
  // durchreichen. Sonst loescht ein Teil-Save im Lead die uebrigen Fahrzeugdaten.
  it('ignoriert null/undefined — kein NULL-Clobber', () => {
    const u = snapshotToVehicleUpdate({
      kennzeichen: 'K-AB 123',
      hersteller: null,
      modell: undefined,
      farbe: null,
    })
    expect(u).toEqual({ kennzeichen_aktuell: 'K-AB 123' })
    expect('hersteller' in u).toBe(false)
    expect('modell_haupttyp' in u).toBe(false)
  })

  it('liefert ein leeres Objekt, wenn nichts gesetzt ist', () => {
    expect(snapshotToVehicleUpdate({})).toEqual({})
  })

  it('verwirft ein unparsbares Erstzulassungsdatum statt es roh zu schreiben', () => {
    const u = snapshotToVehicleUpdate({ erstzulassung: 'demnaechst' })
    expect('erstzulassung' in u).toBe(false)
  })
})
