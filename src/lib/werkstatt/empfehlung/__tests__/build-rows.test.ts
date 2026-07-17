import { describe, it, expect } from 'vitest'
import { buildEmpfehlungRows } from '../build-rows'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'

const v = (id: string, dist: number): WerkstattVorschlag =>
  ({
    id, name: id, adresse_strasse: null, adresse_plz: null, adresse_ort: null, telefon: null,
    lat: 1, lng: 1, status: 'aktiv', faehigkeiten: null, verifiziert: true, marken: null,
    ist_freie_werkstatt: null, fahrzeug_gruppen: null, distanz_km: dist, markenMatch: 'unbekannt',
    gewerkeFit: 'unbekannt', gruppenFit: 'unbekannt', passt: false,
    gruende: [{ typ: 'distanz', text: `${dist} km` }],
  }) as unknown as WerkstattVorschlag

describe('buildEmpfehlungRows', () => {
  it('mapt selektierte Vorschlaege auf Rows mit Rang = Auswahlreihenfolge', () => {
    const rows = buildEmpfehlungRows([v('a', 3), v('b', 5), v('c', 9)], ['c', 'a'])
    expect(rows).toEqual([
      { werkstatt_id: 'c', rang: 1, distanz_km: 9, match_snapshot: { gruende: [{ typ: 'distanz', text: '9 km' }] } },
      { werkstatt_id: 'a', rang: 2, distanz_km: 3, match_snapshot: { gruende: [{ typ: 'distanz', text: '3 km' }] } },
    ])
  })

  it('ignoriert unbekannte IDs, cappt bei 3, Infinity -> null', () => {
    const inf = v('x', Infinity)
    const rows = buildEmpfehlungRows([inf, v('a', 1), v('b', 2), v('c', 3), v('d', 4)], ['x', 'a', 'b', 'c', 'zzz'])
    expect(rows.map((r) => r.werkstatt_id)).toEqual(['x', 'a', 'b'])
    expect(rows[0].distanz_km).toBeNull()
  })
})
