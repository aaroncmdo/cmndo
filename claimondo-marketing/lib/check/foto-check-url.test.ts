import { describe, it, expect } from 'vitest'
import { buildFotoCheckUrl } from './foto-check-url'

const ORIGIN = 'https://app.claimondo.de'

describe('buildFotoCheckUrl', () => {
  it('liefert die Basis-URL ohne Params', () => {
    expect(buildFotoCheckUrl(ORIGIN, '')).toBe('https://app.claimondo.de/embed/anspruch-pruefen')
  })

  it('reicht utm, Ads-Click-IDs und Makler-Code durch, filtert Fremd-Params', () => {
    const url = buildFotoCheckUrl(ORIGIN, '?utm_source=google&gclid=abc123&m=NICOLAS10&foo=bar')
    const u = new URL(url)
    expect(u.pathname).toBe('/embed/anspruch-pruefen')
    expect(u.searchParams.get('utm_source')).toBe('google')
    expect(u.searchParams.get('gclid')).toBe('abc123')
    expect(u.searchParams.get('m')).toBe('NICOLAS10')
    expect(u.searchParams.get('foo')).toBeNull()
  })

  it('ignoriert leere Werte', () => {
    expect(buildFotoCheckUrl(ORIGIN, '?utm_source=&m=')).toBe('https://app.claimondo.de/embed/anspruch-pruefen')
  })

  it('reicht extra-Kontext (schuld aus /check) durch, neben der Attribution', () => {
    const u = new URL(buildFotoCheckUrl(ORIGIN, '?m=NICOLAS10', { schuld: 'unverschuldet' }))
    expect(u.searchParams.get('m')).toBe('NICOLAS10')
    expect(u.searchParams.get('schuld')).toBe('unverschuldet')
  })

  it('laesst undefined extra-Werte weg', () => {
    expect(buildFotoCheckUrl(ORIGIN, '', { schuld: undefined })).toBe('https://app.claimondo.de/embed/anspruch-pruefen')
  })
})
