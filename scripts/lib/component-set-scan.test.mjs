import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './component-set-scan.mjs'

describe('scanContent', () => {
  it('flaggt handgerollten Button mit Brand-Styling', () => {
    const src = '<button className="rounded-lg bg-claimondo-navy px-4">Los</button>'
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt handgerollte <table>', () => {
    expect(scanContent('<table><tbody/></table>')).not.toBeNull()
  })
  it('ignoriert sauberes Markup ohne Treffer', () => {
    expect(scanContent('<div className="flex gap-2"><Button>Los</Button></div>')).toBeNull()
  })
})

describe('diffBaseline', () => {
  it('meldet neue Verletzer (in current, nicht in baseline)', () => {
    const r = diffBaseline(['a.tsx', 'b.tsx'], ['a.tsx'])
    expect(r.added).toEqual(['b.tsx'])
    expect(r.removed).toEqual([])
  })
  it('meldet behobene Verletzer (in baseline, nicht in current)', () => {
    const r = diffBaseline(['a.tsx'], ['a.tsx', 'c.tsx'])
    expect(r.added).toEqual([])
    expect(r.removed).toEqual(['c.tsx'])
  })
})
