import { describe, it, expect } from 'vitest'
import { typingDurationMs } from './typing'

describe('typingDurationMs', () => {
  it('kurzer Text → Minimum 1200ms', () => expect(typingDurationMs('Hi')).toBe(1200))
  it('langer Text → Maximum 2800ms', () => expect(typingDurationMs('x'.repeat(200))).toBe(2800))
  it('mittel → laenge*55 geclamped (40 Zeichen → 2200)', () => expect(typingDurationMs('x'.repeat(40))).toBe(2200))
})
