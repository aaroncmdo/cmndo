import { describe, it, expect } from 'vitest'
import { getKundeFahrzeuge } from '../fahrzeuge'

function mockDb(rows: unknown[] | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: rows, error }),
        }),
      }),
    }),
  } as never
}

describe('getKundeFahrzeuge', () => {
  it('mappt owner-Fahrzeuge aufs ViewModel', async () => {
    const rows = [
      {
        id: 'veh-1',
        kennzeichen_aktuell: 'B-XY 123',
        hersteller: 'VW',
        modell_haupttyp: 'Golf',
        farbe_klartext: 'Schwarz',
        aktueller_kilometerstand: 42000,
        fin: 'WVWZZZ1KZ0000001',
      },
      {
        id: 'veh-2',
        kennzeichen_aktuell: null,
        hersteller: null,
        modell_haupttyp: null,
        farbe_klartext: null,
        aktueller_kilometerstand: null,
        fin: null,
      },
    ]
    const result = await getKundeFahrzeuge(mockDb(rows), 'user-1')
    expect(result).toEqual([
      {
        vehicleId: 'veh-1',
        kennzeichen: 'B-XY 123',
        hersteller: 'VW',
        modell: 'Golf',
        farbe: 'Schwarz',
        kilometerstand: 42000,
        fin: 'WVWZZZ1KZ0000001',
      },
      {
        vehicleId: 'veh-2',
        kennzeichen: null,
        hersteller: null,
        modell: null,
        farbe: null,
        kilometerstand: null,
        fin: null,
      },
    ])
  })

  it('leere Liste wenn der Kunde keine owned Fahrzeuge hat', async () => {
    expect(await getKundeFahrzeuge(mockDb([]), 'user-x')).toEqual([])
  })

  it('Query-Fehler -> leere Liste (kein throw)', async () => {
    expect(await getKundeFahrzeuge(mockDb(null, { message: 'boom' }), 'user-x')).toEqual([])
  })
})
