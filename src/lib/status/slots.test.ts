// src/lib/status/slots.test.ts
import { describe, it, expect } from 'vitest'
import { statusSlotClass, STATUS_SLOT_CLASSES } from './slots'

describe('statusSlotClass', () => {
  it('returns the exact token class for each slot', () => {
    expect(statusSlotClass('success')).toBe('bg-success-soft text-success-strong')
    expect(statusSlotClass('danger')).toBe('bg-danger-soft text-danger-strong')
    expect(statusSlotClass('neutral')).toBe('bg-claimondo-bg text-claimondo-ondo')
  })
  it('falls back to neutral when slot is undefined', () => {
    expect(statusSlotClass(undefined)).toBe(STATUS_SLOT_CLASSES.neutral)
  })
  it('covers all 7 slots', () => {
    expect(Object.keys(STATUS_SLOT_CLASSES).sort()).toEqual(
      ['active', 'danger', 'done', 'neutral', 'pending', 'success', 'warning'],
    )
  })
})
