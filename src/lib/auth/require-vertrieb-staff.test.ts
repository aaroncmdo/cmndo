import { describe, it, expect } from 'vitest'
import { istVertriebRolle } from './require-vertrieb-staff'

describe('istVertriebRolle', () => {
  it('accepts staff roles', () => {
    expect(istVertriebRolle('admin')).toBe(true)
    expect(istVertriebRolle('dispatch')).toBe(true)
    expect(istVertriebRolle('leadbearbeiter')).toBe(true)
  })
  it('rejects non-staff / empty / null', () => {
    expect(istVertriebRolle('sv')).toBe(false)
    expect(istVertriebRolle('kunde')).toBe(false)
    expect(istVertriebRolle('')).toBe(false)
    expect(istVertriebRolle(null)).toBe(false)
    expect(istVertriebRolle(undefined)).toBe(false)
  })
})
