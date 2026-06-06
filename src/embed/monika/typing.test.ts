import { describe, it, expect } from 'vitest'
import { typingDurationMs } from './typing'

describe('typingDurationMs', () => {
  it('kurzer Text → Minimum 500ms', () => expect(typingDurationMs('Hi')).toBe(500))
  it('langer Text → Maximum 1200ms', () => expect(typingDurationMs('x'.repeat(200))).toBe(1200))
  it('mittel → laenge*35 geclamped', () => expect(typingDurationMs('x'.repeat(20))).toBe(700))
})
