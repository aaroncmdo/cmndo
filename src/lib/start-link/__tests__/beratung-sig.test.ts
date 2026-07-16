import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { beratungsUrl, verifyBeratungsSig, BERATUNG_LINK_TTL_TAGE } from '../beratung-sig'

const SECRET = 'test-secret-beratung'
const LEAD = '4c1f8f3a-0000-4000-8000-000000000001'

let prevSecret: string | undefined

beforeEach(() => {
  prevSecret = process.env.START_LINK_HMAC_SECRET
  process.env.START_LINK_HMAC_SECRET = SECRET
})
afterEach(() => {
  if (prevSecret === undefined) delete process.env.START_LINK_HMAC_SECRET
  else process.env.START_LINK_HMAC_SECRET = prevSecret
})

function parseUrl(url: string): { leadId: string; exp: string; sig: string } {
  const u = new URL(url)
  return {
    leadId: u.pathname.split('/').pop() as string,
    exp: u.searchParams.get('exp') as string,
    sig: u.searchParams.get('sig') as string,
  }
}

describe('beratungsUrl + verifyBeratungsSig — Roundtrip', () => {
  it('gebauter Link verified ok (30d TTL)', () => {
    const now = 1_800_000_000_000
    const url = beratungsUrl(LEAD, 'https://app.claimondo.de', now)
    expect(url).toContain(`/beratung/${LEAD}?exp=`)
    const { leadId, exp, sig } = parseUrl(url as string)
    expect(Number(exp)).toBe(Math.floor(now / 1000) + BERATUNG_LINK_TTL_TAGE * 24 * 60 * 60)
    expect(verifyBeratungsSig(leadId, exp, sig, now)).toEqual({ ok: true })
  })

  it('ohne Secret -> null (Caller faellt auf Marketing-Link zurueck)', () => {
    delete process.env.START_LINK_HMAC_SECRET
    expect(beratungsUrl(LEAD)).toBeNull()
    expect(verifyBeratungsSig(LEAD, '123', 'ab')).toEqual({ ok: false, reason: 'missing_secret' })
  })

  it('manipulierte Signatur / fremde leadId -> bad_sig', () => {
    const url = beratungsUrl(LEAD) as string
    const { exp, sig } = parseUrl(url)
    const flipped = (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1)
    expect(verifyBeratungsSig(LEAD, exp, flipped)).toEqual({ ok: false, reason: 'bad_sig' })
    expect(verifyBeratungsSig('4c1f8f3a-0000-4000-8000-000000000002', exp, sig)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
  })

  it('abgelaufen -> expired', () => {
    const now = 1_800_000_000_000
    const url = beratungsUrl(LEAD, 'https://app.claimondo.de', now) as string
    const { exp, sig } = parseUrl(url)
    const nach = now + (BERATUNG_LINK_TTL_TAGE * 24 * 60 * 60 + 61) * 1000
    expect(verifyBeratungsSig(LEAD, exp, sig, nach)).toEqual({ ok: false, reason: 'expired' })
  })

  it('KONTEXT-TRENNUNG: /start-Signatur (ohne beratung.-Praefix) gilt hier NICHT', () => {
    const exp = String(Math.floor(Date.now() / 1000) + 3600)
    // So signiert verify-sig.ts die /start-Links: `${id}.${exp}` OHNE Praefix.
    const startSig = createHmac('sha256', SECRET).update(`${LEAD}.${exp}`, 'utf8').digest('hex')
    expect(verifyBeratungsSig(LEAD, exp, startSig)).toEqual({ ok: false, reason: 'bad_sig' })
  })
})
