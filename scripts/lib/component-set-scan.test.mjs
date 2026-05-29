import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './component-set-scan.mjs'

describe('scanContent', () => {
  it('flaggt gefuellten Primaer-Button (claimondo-navy)', () => {
    const src = '<button className="rounded-lg bg-claimondo-navy px-4">Los</button>'
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt gefuellten Primaer-Button (var(--brand-primary))', () => {
    const src = '<button className="rounded-2xl bg-[var(--brand-primary)] text-white">Los</button>'
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt KEINEN Chip (rounded + helles bg-claimondo-bg, kein Brand-Fill)', () => {
    const src = '<button className="rounded bg-claimondo-bg px-2 text-claimondo-navy">Chip</button>'
    expect(scanContent(src)).toBeNull()
  })
  it('flaggt KEINEN Outline-/Toggle-Button (rounded + border, kein Fill)', () => {
    const src = '<button className="rounded border border-claimondo-border text-claimondo-navy">x</button>'
    expect(scanContent(src)).toBeNull()
  })
  it('flaggt KEINEN Opacity-Tint (bg-[var(--brand-primary)]/5 = dezenter Tint, kein Solid-Fill)', () => {
    const src = '<button className="rounded bg-[var(--brand-primary)]/5 text-[var(--brand-primary)]">+ Standort</button>'
    expect(scanContent(src)).toBeNull()
  })
  it('flaggt KEINEN claimondo-Opacity-Tint (bg-claimondo-navy/90)', () => {
    const src = '<button className="rounded bg-claimondo-navy/5 text-claimondo-navy">Toggle</button>'
    expect(scanContent(src)).toBeNull()
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
