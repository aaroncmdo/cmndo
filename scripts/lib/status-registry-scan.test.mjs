import { describe, it, expect } from 'vitest'
import { scanContent, diffBaseline } from './status-registry-scan.mjs'

describe('scanContent — Pattern A (benannte Status-/Farb-Map)', () => {
  it('flaggt STATUS_COLORS mit Semantic-Token-Farben', () => {
    const src = `const STATUS_COLORS = {
      offen: 'bg-warning-soft text-warning-strong',
      erledigt: 'bg-success-soft text-success-strong',
    }`
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt PHASE_PILL_COLOR: Record<...> mit Claimondo-Tints', () => {
    const src = `const PHASE_PILL_COLOR: Record<ClaimMainPhase, string> = {
      erfassung: 'bg-claimondo-bg text-claimondo-ondo',
      abschluss: 'bg-success-soft text-success-strong',
    }`
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt raw Status-Scale-Map (bg-yellow-50 etc.)', () => {
    const src = `const SV_STATUS = { wartet: 'bg-yellow-50 text-yellow-700', aktiv: 'bg-green-50 text-green-700' }`
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt KEINE Label-only-Map (kein Farb-Signal — Labels sind erlaubt)', () => {
    const src = `const STATUS_LABELS = { offen: 'Offen', erledigt: 'Erledigt', neu: 'Neu' }`
    expect(scanContent(src)).toBeNull()
  })
  it('flaggt KEINE Map mit Nicht-Status-Namen (Naming ist der FP-Guard)', () => {
    const src = `const spacing = { row: 'bg-success-soft', col: 'bg-warning-soft' }`
    expect(scanContent(src)).toBeNull()
  })
  it('flaggt KEINE reine Layout-Map (kein Farb-Signal)', () => {
    const src = `const STATUS_SIZE = { sm: 'px-2 py-0.5', md: 'px-3 py-1' }`
    expect(scanContent(src)).toBeNull()
  })
})

describe('scanContent — Pattern B (Status-Farb-Ternary)', () => {
  it('flaggt r.status === "offen" ? "bg-warning-soft..." : ...', () => {
    const src = `const cls = r.status === 'offen' ? 'bg-warning-soft text-warning-strong' : 'bg-success-soft text-success-strong'`
    expect(scanContent(src)).not.toBeNull()
  })
  it('flaggt KEINEN Label-Ternary (kein Farb-Signal)', () => {
    const src = `const label = r.status === 'offen' ? 'Offen' : 'Erledigt'`
    expect(scanContent(src)).toBeNull()
  })
})

describe('scanContent — Skip-Header + sauberer Code', () => {
  it('skippt Files mit status-registry-skip-Header', () => {
    const src = `// status-registry-skip: Chart-Palette, keine Status-Semantik\nconst CHART_COLORS = { a: 'bg-blue-500', b: 'bg-green-500' }`
    expect(scanContent(src)).toBeNull()
  })
  it('ignoriert sauberen Code der die Registry nutzt', () => {
    const src = `import { statusSlotClass, resolveStatus } from '@/lib/status'\nconst cls = statusSlotClass(resolveStatus('fall-status', s).slot)`
    expect(scanContent(src)).toBeNull()
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
