import { describe, it, expect } from 'vitest'
import { scrollDepthRatio, isScrollable, nextBeat, BEAT_TEXT, type TeaserSession } from './teaser'

describe('scrollDepthRatio', () => {
  it('25%', () => expect(scrollDepthRatio(300, 2000, 800)).toBeCloseTo(0.25))
  it('100% am Ende', () => expect(scrollDepthRatio(1200, 2000, 800)).toBe(1))
  it('nicht scrollbar → 1', () => expect(scrollDepthRatio(0, 500, 800)).toBe(1))
})

describe('isScrollable', () => {
  it('scrollbar', () => expect(isScrollable(2000, 800)).toBe(true))
  it('nicht scrollbar', () => expect(isScrollable(500, 800)).toBe(false))
})

describe('nextBeat', () => {
  const base: TeaserSession = { beatsShown: 0, dismissed: false, engaged: false, completed: false }
  it('cold → Beat 1', () => expect(nextBeat(base)).toBe(1))
  it('Beat 1 gezeigt → Beat 2', () => expect(nextBeat({ ...base, beatsShown: 1 })).toBe(2))
  it('2 gezeigt → null', () => expect(nextBeat({ ...base, beatsShown: 2 })).toBe(null))
  it('dismissed → null', () => expect(nextBeat({ ...base, dismissed: true })).toBe(null))
  it('engaged → null', () => expect(nextBeat({ ...base, engaged: true })).toBe(null))
  it('completed → null', () => expect(nextBeat({ ...base, completed: true })).toBe(null))
})

describe('BEAT_TEXT', () => {
  it('Beat 1 = Begruessung', () => expect(BEAT_TEXT[1]).toContain('grüße'))
  it('Beat 2 = sanfter Nachfasser', () => expect(BEAT_TEXT[2]).toContain('Stress'))
})
