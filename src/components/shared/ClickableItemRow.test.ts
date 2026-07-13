import { describe, it, expect } from 'vitest'
import { isInteractiveTarget } from './ClickableItemRow'

// Pure guard predicate — no DOM/router needed. A fake element whose closest()
// mimics the DOM: returns a match when an interactive ancestor should be found.
function fakeEl(matches: boolean) {
  return { closest: (_sel: string) => (matches ? {} : null) } as unknown as EventTarget
}

describe('isInteractiveTarget (ClickableItemRow click-through guard)', () => {
  it('true when the target is inside an interactive control (guard blocks nav)', () => {
    expect(isInteractiveTarget(fakeEl(true))).toBe(true)
  })
  it('false for a plain content click (nav allowed)', () => {
    expect(isInteractiveTarget(fakeEl(false))).toBe(false)
  })
  it('false for null target', () => {
    expect(isInteractiveTarget(null)).toBe(false)
  })
  it('false when target has no closest() (defensive)', () => {
    expect(isInteractiveTarget({} as unknown as EventTarget)).toBe(false)
  })
})
