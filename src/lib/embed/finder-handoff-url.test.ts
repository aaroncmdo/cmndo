import { describe, it, expect } from 'vitest'
import { buildFinderHandoffUrl } from './finder-handoff-url'

const ORIGIN = 'https://app.claimondo.de'

describe('buildFinderHandoffUrl', () => {
  it('reicht den schaetzung-Token durch (Basis, keine Attribution)', () => {
    expect(buildFinderHandoffUrl('', 'TOK123')).toBe('/embed/gutachter-finder?schaetzung=TOK123')
  })

  it('reicht Makler-Code m, utm und Ads-Click-IDs durch, filtert Fremd-Params', () => {
    const u = new URL(
      buildFinderHandoffUrl('?m=MK-ABCD&utm_source=google&gclid=xyz123&foo=bar', 'TOK'),
      ORIGIN,
    )
    expect(u.pathname).toBe('/embed/gutachter-finder')
    expect(u.searchParams.get('m')).toBe('MK-ABCD')
    expect(u.searchParams.get('utm_source')).toBe('google')
    expect(u.searchParams.get('gclid')).toBe('xyz123')
    expect(u.searchParams.get('schaetzung')).toBe('TOK')
    expect(u.searchParams.get('foo')).toBeNull()
  })

  it('ignoriert leere Attribution-Werte', () => {
    expect(buildFinderHandoffUrl('?m=&utm_source=', 'TOK')).toBe('/embed/gutachter-finder?schaetzung=TOK')
  })

  it('setzt schaetzung immer (auch bei vorhandener Attribution)', () => {
    const u = new URL(buildFinderHandoffUrl('?gbraid=abc&wbraid=def&gclsrc=aw', 'TOKEN'), ORIGIN)
    expect(u.searchParams.get('gbraid')).toBe('abc')
    expect(u.searchParams.get('wbraid')).toBe('def')
    expect(u.searchParams.get('gclsrc')).toBe('aw')
    expect(u.searchParams.get('schaetzung')).toBe('TOKEN')
  })
})
