import { describe, it, expect } from 'vitest'
import { routeForEntity } from './route-for-entity'

describe('routeForEntity', () => {
  it('routet claim rollen-bewusst', () => {
    expect(routeForEntity('claim', 'c1', 'kunde')).toBe('/kunde/faelle/c1')
    expect(routeForEntity('claim', 'c1', 'sachverstaendiger')).toBe('/gutachter/fall/c1')
    expect(routeForEntity('claim', 'c1', 'makler')).toBe('/makler/akten/c1')
    expect(routeForEntity('claim', 'c1', 'admin')).toBe('/faelle/c1')
    expect(routeForEntity('claim', 'c1', 'dispatch')).toBe('/faelle/c1')
    expect(routeForEntity('claim', 'c1', 'kanzlei')).toBe('/faelle/c1')
  })

  it('routet lead nach dispatch', () => {
    expect(routeForEntity('lead', 'l1', 'dispatch')).toBe('/dispatch/leads/l1')
  })

  it('gibt null bei fehlender id', () => {
    expect(routeForEntity('claim', '', 'admin')).toBeNull()
  })
})
