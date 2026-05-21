import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { validateTwilioSignature, twilioCallbackUrl } from '../validate-signature'

// AAR-1477: Tests fuer die Twilio-Sig-Verify-Util.
// Gegen-Pattern aus inbound-kb-whatsapp (HMAC-SHA1 ueber sortierte Form-Params).

function computeExpectedSig(token: string, url: string, params: URLSearchParams): string {
  const sortedKeys = Array.from(params.keys()).sort()
  let dataStr = url
  for (const key of sortedKeys) dataStr += key + params.get(key)
  return crypto.createHmac('sha1', token).update(dataStr).digest('base64')
}

describe('validateTwilioSignature', () => {
  const TOKEN = 'test-auth-token-abcdef'
  const URL_PROD = 'https://app.claimondo.de/api/webhooks/twilio/inbound'

  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN
  })
  afterEach(() => {
    delete process.env.TWILIO_AUTH_TOKEN
    vi.restoreAllMocks()
  })

  it('returns true for a valid signature', () => {
    const params = new URLSearchParams('From=%2B491234&To=%2B495678&Body=hello&MessageSid=SM123')
    const validSig = computeExpectedSig(TOKEN, URL_PROD, params)
    expect(validateTwilioSignature(validSig, URL_PROD, params)).toBe(true)
  })

  it('returns false for a tampered signature', () => {
    const params = new URLSearchParams('From=%2B491234&Body=hello')
    const validSig = computeExpectedSig(TOKEN, URL_PROD, params)
    const tampered = validSig.replace(/.$/, validSig.endsWith('A') ? 'B' : 'A')
    expect(validateTwilioSignature(tampered, URL_PROD, params)).toBe(false)
  })

  it('returns false when signature header is missing (null)', () => {
    const params = new URLSearchParams('From=%2B491234')
    expect(validateTwilioSignature(null, URL_PROD, params)).toBe(false)
  })

  it('returns false when signature header is empty string', () => {
    const params = new URLSearchParams('From=%2B491234')
    expect(validateTwilioSignature('', URL_PROD, params)).toBe(false)
  })

  it('returns false when TWILIO_AUTH_TOKEN is not configured', () => {
    delete process.env.TWILIO_AUTH_TOKEN
    const params = new URLSearchParams('From=%2B491234')
    // Sig waere mathematisch korrekt fuer irgendeinen Token, aber ohne ENV
    // koennen wir nichts validieren → false (defense-in-depth).
    const someSig = crypto.createHmac('sha1', 'anything').update('x').digest('base64')
    // Konsolen-Spy: stiller Lauf erwartet 1× console.error
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(validateTwilioSignature(someSig, URL_PROD, params)).toBe(false)
    expect(errSpy).toHaveBeenCalledOnce()
  })

  it('produces same sig regardless of caller-side param order (internal sort)', () => {
    // Twilio sortiert intern alphabetisch. URLSearchParams behaelt Insertion-Order;
    // unser Code sortiert vor Concat. Caller-Order darf egal sein.
    const paramsA = new URLSearchParams()
    paramsA.append('z_last', 'Z')
    paramsA.append('a_first', 'A')
    paramsA.append('m_mid', 'M')

    const paramsB = new URLSearchParams()
    paramsB.append('a_first', 'A')
    paramsB.append('m_mid', 'M')
    paramsB.append('z_last', 'Z')

    const sigA = computeExpectedSig(TOKEN, URL_PROD, paramsA)
    expect(validateTwilioSignature(sigA, URL_PROD, paramsB)).toBe(true)
  })

  it('returns false when URL differs (HMAC over URL+params is path-sensitive)', () => {
    const params = new URLSearchParams('From=%2B491234')
    const sigForProd = computeExpectedSig(TOKEN, URL_PROD, params)
    const stagingUrl = 'https://app.staging.claimondo.de/api/webhooks/twilio/inbound'
    expect(validateTwilioSignature(sigForProd, stagingUrl, params)).toBe(false)
  })

  it('handles empty param body correctly', () => {
    // Twilio kann theoretisch eine Sig auch fuer leeres Body schicken (selten,
    // aber Defaults im Webhook-Test). Sig waere HMAC nur ueber die URL.
    const params = new URLSearchParams()
    const validSig = computeExpectedSig(TOKEN, URL_PROD, params)
    expect(validateTwilioSignature(validSig, URL_PROD, params)).toBe(true)
  })
})

describe('twilioCallbackUrl', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('joins NEXT_PUBLIC_APP_URL + path', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de'
    expect(twilioCallbackUrl('/api/webhooks/twilio/inbound')).toBe(
      'https://app.claimondo.de/api/webhooks/twilio/inbound',
    )
  })

  it('strips trailing slash from NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de/'
    expect(twilioCallbackUrl('/api/twilio/inbound-kb-whatsapp')).toBe(
      'https://app.claimondo.de/api/twilio/inbound-kb-whatsapp',
    )
  })

  it('works for staging hostnames', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.staging.claimondo.de'
    expect(twilioCallbackUrl('/api/webhooks/twilio/inbound')).toBe(
      'https://app.staging.claimondo.de/api/webhooks/twilio/inbound',
    )
  })

  it('throws with helpful message when NEXT_PUBLIC_APP_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(() => twilioCallbackUrl('/api/webhooks/twilio/inbound')).toThrowError(
      /NEXT_PUBLIC_APP_URL fehlt/,
    )
  })

  it('throws when NEXT_PUBLIC_APP_URL is empty string', () => {
    process.env.NEXT_PUBLIC_APP_URL = ''
    expect(() => twilioCallbackUrl('/api/webhooks/twilio/inbound')).toThrowError(
      /NEXT_PUBLIC_APP_URL fehlt/,
    )
  })
})

describe('validateTwilioSignature ↔ twilioCallbackUrl integration', () => {
  it('round-trip: callback-URL + valid sig → true', () => {
    process.env.TWILIO_AUTH_TOKEN = 'integration-token'
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de'

    const url = twilioCallbackUrl('/api/webhooks/twilio/inbound')
    const params = new URLSearchParams('From=%2B491234&MessageSid=SM999')
    const sig = computeExpectedSig('integration-token', url, params)

    expect(validateTwilioSignature(sig, url, params)).toBe(true)

    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.NEXT_PUBLIC_APP_URL
  })
})
