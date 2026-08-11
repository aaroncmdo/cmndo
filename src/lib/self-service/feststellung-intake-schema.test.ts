import { describe, it, expect } from 'vitest'
import { normalizeOptionen } from './feststellung-intake-schema'

describe('normalizeOptionen', () => {
  it('nimmt string[]', () => {
    expect(normalizeOptionen(['ja', 'nein'])).toEqual([
      { wert: 'ja', label: 'ja' },
      { wert: 'nein', label: 'nein' },
    ])
  })
  it('nimmt {wert,label}[] und {value,label}[]', () => {
    expect(normalizeOptionen([{ wert: 'a', label: 'A' }])).toEqual([{ wert: 'a', label: 'A' }])
    expect(normalizeOptionen([{ value: 'b', label: 'B' }])).toEqual([{ wert: 'b', label: 'B' }])
  })
  it('null/leer -> null', () => {
    expect(normalizeOptionen(null)).toBeNull()
    expect(normalizeOptionen([])).toBeNull()
  })
})
