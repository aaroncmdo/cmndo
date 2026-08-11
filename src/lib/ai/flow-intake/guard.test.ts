import { describe, it, expect } from 'vitest'
import { filterDeltas, fehlendePflicht } from './guard'
import type { IntakeFeld } from '@/lib/self-service/feststellung-intake-schema'

const F = (k: string, pflicht = true): IntakeFeld => ({
  feld_key: k,
  typ: 'text',
  label: k,
  hint: null,
  optionen: null,
  pflicht,
  sektion: null,
  spalte: k,
})

describe('guard', () => {
  it('filterDeltas verwirft unbekannte Keys', () => {
    const schema = [F('unfallort')]
    expect(
      filterDeltas({ unfallort: 'Koeln', schuldfrage: 'gegner', sa_unterschrieben: true }, schema),
    ).toEqual({ unfallort: 'Koeln' })
  })
  it('fehlendePflicht listet leere Pflichtfelder', () => {
    const schema = [F('unfallort'), F('unfalldatum'), F('zeugen', false)]
    expect(fehlendePflicht(schema, { unfallort: 'Koeln', unfalldatum: '' })).toEqual(['unfalldatum'])
  })
})
