import { describe, expect, it } from 'vitest'
import { emailSicherheit, websiteSicherheit } from '../sicherheit'

describe('websiteSicherheit', () => {
  it('gibt 90+ bei Firmenname woertlich und passender PLZ', () => {
    expect(websiteSicherheit({ firmaImText: true, plzImText: true, ortImText: true, kernImHost: true }))
      .toBeGreaterThanOrEqual(90)
  })

  it('gibt 70 bis 89, wenn nur der Ort stimmt', () => {
    const s = websiteSicherheit({ firmaImText: false, plzImText: false, ortImText: true, kernImHost: true })
    expect(s).toBeGreaterThanOrEqual(70)
    expect(s).toBeLessThan(90)
  })

  it('bleibt unter 70 bei bloszer Namensaehnlichkeit', () => {
    expect(websiteSicherheit({ firmaImText: false, plzImText: false, ortImText: false, kernImHost: true }))
      .toBeLessThan(70)
  })

  it('gibt 0, wenn nichts passt', () => {
    expect(websiteSicherheit({ firmaImText: false, plzImText: false, ortImText: false, kernImHost: false }))
      .toBe(0)
  })

  it('ueberschreitet 100 nie', () => {
    expect(websiteSicherheit({ firmaImText: true, plzImText: true, ortImText: true, kernImHost: true }))
      .toBeLessThanOrEqual(100)
  })
})

describe('emailSicherheit', () => {
  it('deckelt Rollenadressen auf 60 (T-25)', () => {
    expect(emailSicherheit(true, 95)).toBeLessThanOrEqual(60)
  })

  it('erbt bei persoenlicher Adresse die Website-Sicherheit', () => {
    expect(emailSicherheit(false, 95)).toBe(95)
  })

  it('hebt eine schwache Website-Sicherheit nicht an', () => {
    expect(emailSicherheit(true, 40)).toBe(40)
  })
})
