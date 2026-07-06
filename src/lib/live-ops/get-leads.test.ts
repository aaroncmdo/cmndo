import { describe, it, expect } from 'vitest'
import { applyHasActiveTermin } from './get-leads'
import type { LeadPin } from './types'

const base: Omit<LeadPin, 'id' | 'hasActiveTermin'> = {
  name: 'X', status: 'neu', lat: 52, lng: 13, ort: null, kanal: null, erstelltAm: '2026-01-01T00:00:00Z',
}

describe('applyHasActiveTermin', () => {
  it('markiert Leads mit aktivem Termin', () => {
    const pins: LeadPin[] = [
      { ...base, id: 'a', hasActiveTermin: false },
      { ...base, id: 'b', hasActiveTermin: false },
    ]
    const out = applyHasActiveTermin(pins, new Set(['a']))
    expect(out.find((p) => p.id === 'a')?.hasActiveTermin).toBe(true)
    expect(out.find((p) => p.id === 'b')?.hasActiveTermin).toBe(false)
  })
})
