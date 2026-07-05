// src/lib/status/domains/fall-status.test.ts
import { describe, it, expect } from 'vitest'
import { FALL_STATUS_DEFS } from './fall-status'
import { FALL_STATUS_LABELS } from '@/lib/statusLabels'

describe('FALL_STATUS_DEFS', () => {
  it('has a def for every FALL_STATUS_LABELS code with the same label', () => {
    for (const code of Object.keys(FALL_STATUS_LABELS)) {
      expect(FALL_STATUS_DEFS[code]?.label).toBe(FALL_STATUS_LABELS[code])
    }
  })
  it('assigns semantic slots to terminal states', () => {
    expect(FALL_STATUS_DEFS['vs-reguliert'].slot).toBe('success')
    expect(FALL_STATUS_DEFS['storniert'].slot).toBe('danger')
    expect(FALL_STATUS_DEFS['abgelehnt'].slot).toBe('danger')
  })
})
