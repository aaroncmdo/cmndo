import { describe, it, expect } from 'vitest'
import { isRouteTabActive } from './route-tabs'

describe('isRouteTabActive', () => {
  it('exact tab matches only its own path', () => {
    expect(isRouteTabActive('/admin/faelle', '/admin/faelle', true)).toBe(true)
    expect(isRouteTabActive('/admin/faelle/sla', '/admin/faelle', true)).toBe(false)
  })
  it('non-exact tab matches self and sub-paths', () => {
    expect(isRouteTabActive('/admin/faelle/sla', '/admin/faelle/sla', false)).toBe(true)
    expect(isRouteTabActive('/admin/faelle/sla/x', '/admin/faelle/sla', false)).toBe(true)
  })
  it('non-exact tab does not match a sibling prefix', () => {
    expect(isRouteTabActive('/admin/faelle/statistiken', '/admin/faelle/sla', false)).toBe(false)
  })
  it('null pathname is never active', () => {
    expect(isRouteTabActive(null, '/admin/faelle', true)).toBe(false)
  })
})
