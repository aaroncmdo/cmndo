import { describe, expect, test } from 'vitest'
import { baueNetzwerkPin, svAnzeigeName } from '../netzwerk-geo'

describe('baueNetzwerkPin', () => {
  test('valide Koordinaten -> Pin', () => {
    expect(baueNetzwerkPin('gutachter', 'id1', 'Kelvin', 50.9, 6.9)).toEqual({
      id: 'id1', name: 'Kelvin', rolle: 'gutachter', lat: 50.9, lng: 6.9,
    })
  })

  test('String-Koordinaten (numeric aus DB) werden gecastet', () => {
    const p = baueNetzwerkPin('werkstatt', 'w1', 'Muster', '50.9' as unknown as number, '6.9' as unknown as number)
    expect(p).toEqual({ id: 'w1', name: 'Muster', rolle: 'werkstatt', lat: 50.9, lng: 6.9 })
  })

  test('fehlende/ungueltige Koordinaten -> null (kein Pin ohne Position)', () => {
    expect(baueNetzwerkPin('gutachter', 'id1', 'X', null, 6.9)).toBeNull()
    expect(baueNetzwerkPin('gutachter', 'id1', 'X', 50.9, null)).toBeNull()
    expect(baueNetzwerkPin('gutachter', 'id1', 'X', undefined, undefined)).toBeNull()
    expect(baueNetzwerkPin('gutachter', 'id1', 'X', NaN, 6.9)).toBeNull()
  })
})

describe('svAnzeigeName', () => {
  test('Anzeigename hat Vorrang', () => {
    expect(svAnzeigeName({ anzeigename: 'KFZ Müller', vorname: 'Thomas', nachname: 'Müller' }, 'Müller GmbH')).toBe('KFZ Müller')
  })
  test('sonst Vor+Nachname', () => {
    expect(svAnzeigeName({ anzeigename: null, vorname: 'Thomas', nachname: 'Müller' }, 'Müller GmbH')).toBe('Thomas Müller')
  })
  test('sonst Firmenname', () => {
    expect(svAnzeigeName({ anzeigename: null, vorname: null, nachname: null }, 'Müller GmbH')).toBe('Müller GmbH')
  })
  test('leeres Profil + keine Firma -> Fallback', () => {
    expect(svAnzeigeName(null, null)).toBe('Gutachter')
  })
})
