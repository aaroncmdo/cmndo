import { describe, it, expect } from 'vitest'
import { sollAutoKonvertieren, brauchtReview, type PartnerPolicy } from '../policy'

const P = (o: Partial<PartnerPolicy>): PartnerPolicy => ({
  rolle: 'makler',
  self_signup_erlaubt: false,
  braucht_review: false,
  braucht_zahlung: false,
  auto_konvertieren: false,
  ...o,
})

describe('partner policy', () => {
  it('makler-Policy → auto-konvertieren', () => {
    expect(sollAutoKonvertieren(P({ rolle: 'makler', auto_konvertieren: true }))).toBe(true)
  })
  it('sachverstaendiger → kein auto, aber review', () => {
    const p = P({ rolle: 'sachverstaendiger', braucht_review: true, braucht_zahlung: true })
    expect(sollAutoKonvertieren(p)).toBe(false)
    expect(brauchtReview(p)).toBe(true)
  })
  it('werkstatt → kein self_signup', () => {
    expect(P({ rolle: 'werkstatt', self_signup_erlaubt: false }).self_signup_erlaubt).toBe(false)
  })
})
