import { describe, it, expect } from 'vitest'
import { buildIntakeSystemPrompt } from './prompt'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (o: Partial<IntakeFeld>): IntakeFeld => ({
  feld_key: 'unfallhergang',
  typ: 'text',
  label: 'Unfallhergang',
  hint: null,
  optionen: null,
  pflicht: true,
  sektion: 'unfall',
  spalte: 'unfallhergang',
  ...o,
})

describe('buildIntakeSystemPrompt', () => {
  it('nennt den Firmennamen als Persona', () => {
    const p = buildIntakeSystemPrompt({ firmenname: 'KFZ Mueller', schema: [F({})], bekannt: {} })
    expect(p).toContain('KFZ Mueller')
  })
  it('faellt ohne Firmennamen auf Claimondo zurueck', () => {
    const p = buildIntakeSystemPrompt({ firmenname: null, schema: [F({})], bekannt: {} })
    expect(p).toContain('Claimondo')
  })
  it('listet nur noch offene Pflichtfelder', () => {
    const schema = [
      F({ feld_key: 'unfallhergang' }),
      F({ feld_key: 'unfallort', label: 'Unfallort', spalte: 'unfallort' }),
    ]
    const p = buildIntakeSystemPrompt({ firmenname: null, schema, bekannt: { unfallhergang: 'x' } })
    expect(p).toContain('Unfallort')
    expect(p).not.toContain('- Unfallhergang')
  })
})
