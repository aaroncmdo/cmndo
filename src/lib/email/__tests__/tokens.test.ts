import { describe, it, expect } from 'vitest'
import { email } from '../tokens'

describe('email tokens', () => {
  it('hat die Claimondo-Markenfarben', () => {
    expect(email.color.navy).toBe('#0D1B3E')
    expect(email.color.gold).toBe('#C9A84C')
    expect(email.color.cream).toBe('#F5F1E8')
  })
  it('hat Spacing- und Radien-Skala', () => {
    expect(email.space(4)).toBe('16px') // 4 * 4px
    expect(email.radius.xl).toBe(18)
  })
})
