import { describe, it, expect } from 'vitest'
import { buildShareSnippets, buildMaklerReferralSnippets } from '../share-snippets'

describe('buildShareSnippets', () => {
  const s = buildShareSnippets('MK-ABC', 'Muster Makler GmbH', 'https://claimondo.de/')

  it('url = base/m/code, ohne doppelten Slash', () => {
    expect(s.url).toBe('https://claimondo.de/m/MK-ABC')
  })

  it('whatsappHref = wa.me-Link mit encodierter url + firma', () => {
    expect(s.whatsappHref.startsWith('https://wa.me/?text=')).toBe(true)
    const decoded = decodeURIComponent(s.whatsappHref)
    expect(decoded).toContain('https://claimondo.de/m/MK-ABC')
    expect(decoded).toContain('Muster Makler GmbH')
  })

  it('signatur enthaelt firma + url', () => {
    expect(s.signatur).toContain('Muster Makler GmbH')
    expect(s.signatur).toContain('https://claimondo.de/m/MK-ABC')
  })

  it('embed = a-tag mit url + firma', () => {
    expect(s.embed).toContain('href="https://claimondo.de/m/MK-ABC"')
    expect(s.embed).toContain('Muster Makler GmbH')
    expect(s.embed).toContain('<a ')
  })
})

describe('buildMaklerReferralSnippets', () => {
  const s = buildMaklerReferralSnippets('MK-ABC', 'Muster Makler GmbH', 'https://claimondo.de/')

  it('url = base/makler/registrieren?werber=code, ohne doppelten Slash', () => {
    expect(s.url).toBe('https://claimondo.de/makler/registrieren?werber=MK-ABC')
  })

  it('whatsappHref = wa.me-Link mit encodierter Referral-url', () => {
    expect(s.whatsappHref.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(s.whatsappHref)).toContain(s.url)
  })

  it('mailtoHref = mailto mit subject + encodierter url', () => {
    expect(s.mailtoHref.startsWith('mailto:?subject=')).toBe(true)
    expect(decodeURIComponent(s.mailtoHref)).toContain(s.url)
  })
})
