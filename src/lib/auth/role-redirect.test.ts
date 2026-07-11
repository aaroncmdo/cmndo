import { describe, it, expect } from 'vitest'
import { roleToPath } from './role-redirect'

describe('roleToPath', () => {
  it('routes flottenmanager to /flotte', () => {
    expect(roleToPath('flottenmanager')).toBe('/flotte')
  })
  it('keeps existing makler routing intact', () => {
    expect(roleToPath('makler')).toBe('/makler')
  })
})
