import { describe, it, expect } from 'vitest'
import { containsLink } from './spam'

describe('containsLink', () => {
  it('erkennt http/https/www', () => {
    expect(containsLink('schau mal http://spam.de')).toBe(true)
    expect(containsLink('https://x.io kaufen')).toBe(true)
    expect(containsLink('siehe www.spam.com')).toBe(true)
  })
  it('ignoriert normalen Text + Abkuerzungen', () => {
    expect(containsLink('Das ist z.B. ein guter Tipp.')).toBe(false)
    expect(containsLink('Mein Schaden war hoch, danke.')).toBe(false)
  })
})
