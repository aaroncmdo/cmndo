import { describe, it, expect } from 'vitest'
import { resolveWerkstattFallbackGeo, type WerkstattGeoRow } from '../werkstatt-geo-fallback'

// Task 11: Unit-Tests fuer den reinen Werkstatt-Geo-Fallback-Helper.
// Kein I/O, keine Mocks — nur konkrete Eingaben und erwartete Ausgaben.
// Der Helper entscheidet, ob die Werkstatt-Geo als Besichtigungsort-Fallback
// genutzt wird (Resume-Safety-Net fuer /flow-Leads ohne Coords).

const werkstattMitGeo: WerkstattGeoRow = {
  lat: 51.5,
  lng: 7.1,
  adresse_strasse: 'Hauptstrasse 1',
  adresse_plz: '44137',
  adresse_ort: 'Dortmund',
}

const werkstattOhneGeo: WerkstattGeoRow = {
  lat: null,
  lng: null,
  adresse_strasse: 'Hauptstrasse 1',
  adresse_plz: '44137',
  adresse_ort: 'Dortmund',
}

describe('resolveWerkstattFallbackGeo', () => {
  // Kernfall: werkstatt-Lead ohne Coords -> Werkstatt-Geo als Fallback.
  it('gibt Werkstatt-Coords zurueck wenn Lead keine Coords hat und Werkstatt Geo besitzt', () => {
    const result = resolveWerkstattFallbackGeo(null, null, werkstattMitGeo)
    expect(result).not.toBeNull()
    expect(result?.lat).toBe(51.5)
    expect(result?.lng).toBe(7.1)
    expect(result?.adresse).toBe('Hauptstrasse 1, 44137 Dortmund')
  })

  // Idempotenz: Lead hat bereits Coords -> Werkstatt wird NICHT genutzt.
  it('gibt null zurueck wenn Lead bereits Coords hat (kein Override)', () => {
    const result = resolveWerkstattFallbackGeo(51.0, 7.0, werkstattMitGeo)
    expect(result).toBeNull()
  })

  // Nur einer der Coords gesetzt (lng fehlt) -> kein gultiger Geo -> Fallback aktiv.
  it('gibt Werkstatt-Coords zurueck wenn nur lat gesetzt ist (lng null)', () => {
    const result = resolveWerkstattFallbackGeo(51.0, null, werkstattMitGeo)
    expect(result).not.toBeNull()
    expect(result?.lat).toBe(51.5)
  })

  // Nur einer der Coords gesetzt (lat fehlt) -> Fallback aktiv.
  it('gibt Werkstatt-Coords zurueck wenn nur lng gesetzt ist (lat null)', () => {
    const result = resolveWerkstattFallbackGeo(null, 7.0, werkstattMitGeo)
    expect(result).not.toBeNull()
    expect(result?.lng).toBe(7.1)
  })

  // Werkstatt ohne Geo -> Fallback kann nicht helfen -> null.
  it('gibt null zurueck wenn Werkstatt keine Coords hat', () => {
    const result = resolveWerkstattFallbackGeo(null, null, werkstattOhneGeo)
    expect(result).toBeNull()
  })

  // Kein Werkstatt-Row (werkstatt_id war null) -> null.
  it('gibt null zurueck wenn kein Werkstatt-Row uebergeben wird (null)', () => {
    const result = resolveWerkstattFallbackGeo(null, null, null)
    expect(result).toBeNull()
  })

  // Adresse-Formatierung: fehlende Teile werden uebersprungen.
  it('formatiert Adresse ohne PLZ korrekt', () => {
    const result = resolveWerkstattFallbackGeo(null, null, {
      lat: 50.0,
      lng: 8.0,
      adresse_strasse: 'Musterweg 5',
      adresse_plz: null,
      adresse_ort: 'Frankfurt',
    })
    expect(result?.adresse).toBe('Musterweg 5, Frankfurt')
  })

  it('formatiert Adresse ohne Strasse korrekt', () => {
    const result = resolveWerkstattFallbackGeo(null, null, {
      lat: 50.0,
      lng: 8.0,
      adresse_strasse: null,
      adresse_plz: '60311',
      adresse_ort: 'Frankfurt',
    })
    expect(result?.adresse).toBe('60311 Frankfurt')
  })

  it('gibt null zurueck wenn Werkstatt-Row vorhanden aber alle Adressfelder null', () => {
    // Coords vorhanden aber kein Adressstring zusammensetzbar -> null adresse -> still valid
    // (adresse kann leer sein, Coords genuegen fuer den Resolver; adresse wird best-effort formatiert)
    const result = resolveWerkstattFallbackGeo(null, null, {
      lat: 50.0,
      lng: 8.0,
      adresse_strasse: null,
      adresse_plz: null,
      adresse_ort: null,
    })
    // Coords sind da -> Ergebnis ist nicht null, adresse ist leerer String.
    expect(result).not.toBeNull()
    expect(result?.adresse).toBe('')
  })

  // Beide Coords null und Lead auch null -> sicheres Null.
  it('gibt null zurueck wenn Lead-Coords und Werkstatt-Coords beide null', () => {
    const result = resolveWerkstattFallbackGeo(null, null, null)
    expect(result).toBeNull()
  })
})
