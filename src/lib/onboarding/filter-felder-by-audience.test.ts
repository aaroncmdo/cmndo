import { describe, it, expect } from 'vitest'
import { filterFelderByAudience } from './filter-felder-by-audience'
import type { OnboardingFeld } from '@/components/onboarding/types'

const f = (k: string, audience?: string): OnboardingFeld =>
  ({ id: k, phase_id: 'p', reihenfolge: 0, feld_key: k, typ: 'text', label: k,
     pflicht: false, db_target: { tabelle: 'leads', spalte: k }, audience } as unknown as OnboardingFeld)

describe('filterFelderByAudience', () => {
  it('kunde sieht kunde + beide + undefined(=beide)', () => {
    const felder = [f('a', 'kunde'), f('b', 'dispatcher'), f('c', 'beide'), f('d')]
    expect(filterFelderByAudience(felder, 'kunde').map(x => x.feld_key)).toEqual(['a', 'c', 'd'])
  })
  it('dispatcher sieht dispatcher + beide + undefined', () => {
    const felder = [f('a', 'kunde'), f('b', 'dispatcher'), f('c', 'beide'), f('d')]
    expect(filterFelderByAudience(felder, 'dispatcher').map(x => x.feld_key)).toEqual(['b', 'c', 'd'])
  })
})
