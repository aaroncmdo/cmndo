import { describe, it, expect } from 'vitest'
import { parseTab } from '../tab'

describe('parseTab', () => {
  it('gueltige Tabs bleiben', () => {
    for (const t of ['feed', 'verbindungen', 'anfragen', 'karte'] as const) expect(parseTab(t)).toBe(t)
  })
  it('unbekannt/undefined -> feed', () => {
    expect(parseTab(undefined)).toBe('feed')
    expect(parseTab('xyz')).toBe('feed')
  })
})
