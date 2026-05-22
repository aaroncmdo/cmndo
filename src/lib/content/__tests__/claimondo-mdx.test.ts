import { describe, it, expect } from 'vitest'
import {
  getAllAssets, getCornerstones, getHaftpflichtSpokes, getDecoder, groupSpokesByCluster,
} from '../claimondo-mdx'

// Regression: parseFrontmatter warf bei mehrzeiligen `related:`-Arrays
// (`'' ?? []` ergab '' statt [], dann `''.push()` -> TypeError). getAllAssets()
// darf die 69 Files ohne Crash parsen.
describe('claimondo content discovery', () => {
  it('liest 69 Assets ohne Crash (2/57/10)', () => {
    expect(getCornerstones().length).toBe(2)
    expect(getHaftpflichtSpokes().length).toBe(57)
    expect(getDecoder().length).toBe(10)
    expect(getAllAssets().length).toBe(69)
  })

  it('gruppiert Spokes nach Cluster (H1/H2/H3/H4/H6/H7)', () => {
    const g = groupSpokesByCluster()
    expect(Object.keys(g).length).toBeGreaterThan(0)
  })
})
