import { describe, it, expect } from 'vitest'
import { darfAnnehmenOderAblehnen, darfEntfernenOderBlockieren } from '../verbindungen-core'

const A = 'aaaaaaaa-0000-0000-0000-000000000001'
const B = 'bbbbbbbb-0000-0000-0000-000000000002'
const offen = { anfrager_id: A, empfaenger_id: B, status: 'offen' as const }

describe('darfAnnehmenOderAblehnen', () => {
  it('nur der Empfaenger einer offenen Anfrage darf', () => {
    expect(darfAnnehmenOderAblehnen(offen, B)).toBe(true)
    expect(darfAnnehmenOderAblehnen(offen, A)).toBe(false) // Anfrager nicht
  })
  it('nicht mehr, wenn bereits angenommen', () => {
    expect(darfAnnehmenOderAblehnen({ ...offen, status: 'angenommen' }, B)).toBe(false)
  })
  it('Unbeteiligter darf nie', () => {
    expect(darfAnnehmenOderAblehnen(offen, 'cccccccc-0000-0000-0000-000000000003')).toBe(false)
  })
})

describe('darfEntfernenOderBlockieren', () => {
  it('beide Beteiligten duerfen', () => {
    const ang = { ...offen, status: 'angenommen' as const }
    expect(darfEntfernenOderBlockieren(ang, A)).toBe(true)
    expect(darfEntfernenOderBlockieren(ang, B)).toBe(true)
  })
  it('Unbeteiligter darf nie', () => {
    expect(darfEntfernenOderBlockieren(offen, 'dddddddd-0000-0000-0000-000000000004')).toBe(false)
  })
})
