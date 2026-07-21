import { describe, it, expect } from 'vitest'
import { fmDarfStornieren } from './fm-storno-erlaubt'

describe('fmDarfStornieren', () => {
  it('erlaubt frueh-stufige Status (vor SV-Zuweisung)', () => {
    expect(fmDarfStornieren('ersterfassung')).toBe(true)
    expect(fmDarfStornieren('onboarding')).toBe(true)
    expect(fmDarfStornieren('sv-gesucht')).toBe(true)
  })

  it('verbietet fortgeschrittene / terminale Status', () => {
    expect(fmDarfStornieren('sv-zugewiesen')).toBe(false)
    expect(fmDarfStornieren('sv-termin')).toBe(false)
    expect(fmDarfStornieren('besichtigung')).toBe(false)
    expect(fmDarfStornieren('abgeschlossen')).toBe(false)
    expect(fmDarfStornieren('storniert')).toBe(false)
  })

  it('verbietet null/undefined/leer', () => {
    expect(fmDarfStornieren(null)).toBe(false)
    expect(fmDarfStornieren(undefined)).toBe(false)
    expect(fmDarfStornieren('')).toBe(false)
  })
})
