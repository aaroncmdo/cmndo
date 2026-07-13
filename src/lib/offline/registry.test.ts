import { describe, it, expect, beforeEach } from 'vitest'
import { registerHandler, getHandler, getRegisteredKinds, clearHandlers } from './registry'

beforeEach(() => clearHandlers())

describe('registry', () => {
  it('registers and retrieves a handler by kind', () => {
    const h = { kind: 'demo', replay: async () => ({ outcome: 'done' as const }) }
    registerHandler(h)
    expect(getHandler('demo')).toBe(h)
    expect(getRegisteredKinds()).toEqual(['demo'])
  })
  it('returns undefined for unknown kind', () => {
    expect(getHandler('nope')).toBeUndefined()
  })
})
