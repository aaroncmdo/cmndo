import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { generateAirdropToken, hashAirdropToken, airdropLookupPrefix } from '../token'

describe('generateAirdropToken', () => {
  it('liefert Token, SHA-256-Hash und 8-Zeichen-Prefix', () => {
    const { token, tokenHash, lookupPrefix } = generateAirdropToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/) // 16 Byte base64url
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(lookupPrefix).toBe(token.slice(0, 8))
    expect(lookupPrefix).toHaveLength(8) // varchar(8) — laenger wuerde die DB abweisen
  })

  it('ist bei jedem Aufruf verschieden', () => {
    const a = generateAirdropToken()
    const b = generateAirdropToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
})

describe('hashAirdropToken / airdropLookupPrefix', () => {
  it('sind deterministisch — derselbe Token ergibt denselben Hash', () => {
    const { token, tokenHash, lookupPrefix } = generateAirdropToken()
    expect(hashAirdropToken(token)).toBe(tokenHash)
    expect(airdropLookupPrefix(token)).toBe(lookupPrefix)
  })
})
