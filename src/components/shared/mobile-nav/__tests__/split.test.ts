import { describe, it, expect } from 'vitest'
import { barItems, isNavItemActive } from '../split'
import type { MobileNavItem } from '../types'

const item = (href: string, exact?: boolean): MobileNavItem =>
  ({ href, label: href, icon: (() => null) as unknown as MobileNavItem['icon'], exact })

describe('mobile-nav split', () => {
  it('barItems zeigt hoechstens 4 Primaer-Tabs', () => {
    const five = [item('/a'), item('/b'), item('/c'), item('/d'), item('/e')]
    expect(barItems(five).map((i) => i.href)).toEqual(['/a', '/b', '/c', '/d'])
  })

  it('barItems laesst < 4 unveraendert', () => {
    const two = [item('/a'), item('/b')]
    expect(barItems(two)).toHaveLength(2)
  })

  it('isNavItemActive: exact matcht nur exakt', () => {
    expect(isNavItemActive(item('/kunde', true), '/kunde')).toBe(true)
    expect(isNavItemActive(item('/kunde', true), '/kunde/termine')).toBe(false)
  })

  it('isNavItemActive: nicht-exact matcht Prefix', () => {
    expect(isNavItemActive(item('/admin/faelle'), '/admin/faelle/123')).toBe(true)
    expect(isNavItemActive(item('/admin/faelle'), '/admin/faellex')).toBe(false)
  })

  it('isNavItemActive: null pathname -> false', () => {
    expect(isNavItemActive(item('/a'), null)).toBe(false)
  })
})
