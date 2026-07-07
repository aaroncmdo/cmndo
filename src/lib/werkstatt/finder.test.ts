import { describe, it, expect } from 'vitest'
import { filterEchteWerkstaetten } from './finder'

describe('filterEchteWerkstaetten', () => {
  const rows = [
    { id: '1', email: 'info@schneider-ruhl.de' },      // echt
    { id: '2', email: 'werkstatt-smoke@claimondo.de' }, // intern (Domain)
    { id: '3', email: 'test.werkstatt@web.de' },        // Test-Marker
    { id: '4', email: null },                           // ohne Email -> echt behandelt
  ]
  it('behaelt nur externe/echte Werkstaetten', () => {
    const echte = filterEchteWerkstaetten(rows)
    expect(echte.map((r) => r.id)).toEqual(['1', '4'])
  })
  it('ist eine reine Funktion ohne Seiteneffekt', () => {
    const copy = [...rows]
    filterEchteWerkstaetten(rows)
    expect(rows).toEqual(copy)
  })
})
