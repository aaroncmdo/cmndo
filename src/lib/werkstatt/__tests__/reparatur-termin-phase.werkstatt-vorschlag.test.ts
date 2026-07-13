import { describe, it, expect } from 'vitest'
import { reparaturTerminPhase } from '../reparatur-termin-phase'

describe('reparaturTerminPhase — werkstatt_vorschlag', () => {
  it('mappt werkstatt_vorschlag auf ein info-Label', () => {
    const p = reparaturTerminPhase('werkstatt_vorschlag')
    expect(p.key).toBe('werkstatt_vorschlag')
    expect(p.ton).toBe('info')
    expect(p.label).toBe('Werkstatt schlägt Termin vor')
  })
})
