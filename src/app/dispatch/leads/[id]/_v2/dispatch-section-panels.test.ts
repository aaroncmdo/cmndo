import { describe, it, expect } from 'vitest'
import {
  hasDispatchSectionPanels,
  DISPATCH_SECTION_PANEL_KEYS,
} from './dispatch-section-panel-keys'

describe('dispatch section panels (P2d-3)', () => {
  it('Sektionen mit bespoke Panels (phase_key aus lead-erfassung-Seed)', () => {
    expect(hasDispatchSectionPanels('unfall')).toBe(true) // Unfallskizze + Zeugen
    expect(hasDispatchSectionPanels('termin_sv')).toBe(true) // Wunschtag-Pills
    expect(hasDispatchSectionPanels('schaden')).toBe(true) // Personenschaden-Editor (cond)
    expect(hasDispatchSectionPanels('fahrzeug')).toBe(true) // Cardentity (+ Eigentuemer-Typ Task 6b)
  })

  it('Sektionen ohne Panels -> nur Felder', () => {
    expect(hasDispatchSectionPanels('kontakt')).toBe(false)
    // echtes phase_key ist 'termin_sv', NICHT 'termin' — Tippfehler-Guard
    expect(hasDispatchSectionPanels('termin')).toBe(false)
    expect(hasDispatchSectionPanels('status')).toBe(false)
  })

  it('Panel-Keys sind eindeutig', () => {
    expect(new Set(DISPATCH_SECTION_PANEL_KEYS).size).toBe(DISPATCH_SECTION_PANEL_KEYS.length)
  })
})
