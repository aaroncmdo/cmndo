import { describe, it, expect } from 'vitest'
import { shouldThrottle } from './sound'

describe('shouldThrottle', () => {
  it('erster Play (lastAt null) → nicht gedrosselt', () => expect(shouldThrottle(null, 1000)).toBe(false))
  it('innerhalb 1s → gedrosselt', () => expect(shouldThrottle(1000, 1500)).toBe(true))
  it('nach 1s → nicht gedrosselt', () => expect(shouldThrottle(1000, 2100)).toBe(false))
  it('exakt 1s → nicht gedrosselt (>=)', () => expect(shouldThrottle(1000, 2000)).toBe(false))
})
