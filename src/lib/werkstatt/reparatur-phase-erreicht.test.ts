import { describe, it, expect } from 'vitest'
import { reparaturPhaseErreicht } from './reparatur-phase-erreicht'

describe('reparaturPhaseErreicht', () => {
  it('Selbstzahler: sofort true (kein Gutachten nötig)', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'selbstzahler' }, null)).toBe(true)
  })
  it('Kasko: sofort true', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'kasko' }, null)).toBe(true)
  })
  it('Haftpflicht ohne Gutachten: false (Reparatur erst nach Gutachten)', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, null)).toBe(false)
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, { gutachtenAbgeschlossen: false, totalschaden: null })).toBe(false)
  })
  it('Haftpflicht mit fertigem Gutachten, kein Totalschaden: true', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, { gutachtenAbgeschlossen: true, totalschaden: false })).toBe(true)
  })
  it('Haftpflicht Totalschaden: false (keine Reparatur)', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: 'haftpflicht' }, { gutachtenAbgeschlossen: true, totalschaden: true })).toBe(false)
  })
  it('unbekannter/null Abrechnungsweg: konservativ false', () => {
    expect(reparaturPhaseErreicht({ abrechnungsweg: null }, null)).toBe(false)
  })
})
