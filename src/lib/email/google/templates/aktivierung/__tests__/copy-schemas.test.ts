import { describe, it, expect } from 'vitest'
import { copySchemas } from '../copy-schemas'

describe('copySchemas', () => {
  it('nutzen: 4 Bloecke verlangt', () => {
    const bad = { headline: 'h', bloecke: [{ titel: 't', text: 'x' }], schluss: 's', cta_label: 'c' }
    expect(copySchemas.nutzen.safeParse(bad).success).toBe(false)
    const good = { headline: 'h', bloecke: Array.from({ length: 4 }, () => ({ titel: 't', text: 'x' })), schluss: 's', cta_label: 'c' }
    expect(copySchemas.nutzen.safeParse(good).success).toBe(true)
  })

  it('willkommen: Pflichtfelder', () => {
    expect(copySchemas.willkommen.safeParse({}).success).toBe(false)
  })
})
