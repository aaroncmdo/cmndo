import { describe, it, expect, afterEach } from 'vitest'
import { assertCronAuth } from './cron-auth'

function reqWith(auth?: string): Request {
  return new Request('https://app.claimondo.de/api/cron/x', auth ? { headers: { authorization: auth } } : undefined)
}

describe('assertCronAuth', () => {
  const orig = process.env.CRON_SECRET
  afterEach(() => {
    if (orig === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = orig
  })

  it('fail-CLOSED: verweigert wenn CRON_SECRET unset — auch beim "Bearer undefined"-Bypass', () => {
    delete process.env.CRON_SECRET
    expect(assertCronAuth(reqWith('Bearer undefined'))).toBe(false)
    expect(assertCronAuth(reqWith(undefined))).toBe(false)
  })

  it('erlaubt bei korrektem Bearer-Token', () => {
    process.env.CRON_SECRET = 's3cret-value'
    expect(assertCronAuth(reqWith('Bearer s3cret-value'))).toBe(true)
  })

  it('verweigert bei falschem/fehlendem/prefix-losem Header', () => {
    process.env.CRON_SECRET = 's3cret-value'
    expect(assertCronAuth(reqWith('Bearer wrong'))).toBe(false)
    expect(assertCronAuth(reqWith(undefined))).toBe(false)
    expect(assertCronAuth(reqWith('s3cret-value'))).toBe(false)
  })
})
