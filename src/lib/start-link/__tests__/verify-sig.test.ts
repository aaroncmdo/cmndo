import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyStartSig } from '../verify-sig'

// AAR-956 Phase A — Tests fuer die /start-Link-Signatur-Verify.
// Gegenstueck zur Marketing-Front-Signatur (commit 09ae79bff):
//   signedString = `${anfrageId}.${exp}`   (exp = Unix-SEKUNDEN)
//   sig          = HMAC_SHA256(signedString, secret).digest('hex')  (lowercase)

const SECRET = 'test-start-secret-0123456789'

function sign(anfrageId: string, exp: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${anfrageId}.${exp}`, 'utf8').digest('hex')
}

describe('verifyStartSig', () => {
  const ANFRAGE = '11111111-2222-3333-4444-555555555555'
  const NOW_MS = 1_900_000_000_000 // fixe Testzeit (ms)
  const NOW_SEC = Math.floor(NOW_MS / 1000) // 1900000000
  const FUTURE = NOW_SEC + 3600 // 1h Zukunft -> 1900003600
  const PAST = NOW_SEC - 1

  beforeEach(() => {
    process.env.START_LINK_HMAC_SECRET = SECRET
  })
  afterEach(() => {
    delete process.env.START_LINK_HMAC_SECRET
    vi.restoreAllMocks()
  })

  it('akzeptiert eine gueltige, nicht abgelaufene Signatur', () => {
    const sig = sign(ANFRAGE, FUTURE)
    expect(verifyStartSig(ANFRAGE, String(FUTURE), sig, NOW_MS)).toEqual({ ok: true })
  })

  it('known vector — lockt Algorithmus+Format gegen die Marketing-Front', () => {
    // Unabhaengig berechnet (node crypto): HMAC_SHA256(
    //   "11111111-2222-3333-4444-555555555555.1900003600", SECRET).hex
    const KNOWN = '392d337223780d2579cc2f581e21d7ca3283a11f3381f83eb697744533ae6b8d'
    expect(sign(ANFRAGE, FUTURE)).toBe(KNOWN)
    expect(verifyStartSig(ANFRAGE, String(FUTURE), KNOWN, NOW_MS)).toEqual({ ok: true })
  })

  it('lehnt eine manipulierte Signatur ab (bad_sig)', () => {
    const sig = sign(ANFRAGE, FUTURE)
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a')
    expect(verifyStartSig(ANFRAGE, String(FUTURE), tampered, NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
  })

  it('lehnt eine fuer eine ANDERE anfrageId gebaute Signatur ab (bad_sig)', () => {
    const sig = sign('99999999-8888-7777-6666-555555555555', FUTURE)
    expect(verifyStartSig(ANFRAGE, String(FUTURE), sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
  })

  it('lehnt ab, wenn exp manipuliert wurde (Signatur deckt exp mit ab → bad_sig)', () => {
    const sig = sign(ANFRAGE, FUTURE)
    // Angreifer verlaengert exp, ohne neu zu signieren.
    expect(verifyStartSig(ANFRAGE, String(FUTURE + 999_999), sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
  })

  it('lehnt eine abgelaufene (aber korrekt signierte) Signatur ab (expired)', () => {
    const sig = sign(ANFRAGE, PAST)
    expect(verifyStartSig(ANFRAGE, String(PAST), sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('akzeptiert exp == now (Grenzfall, nicht abgelaufen)', () => {
    const sig = sign(ANFRAGE, NOW_SEC)
    expect(verifyStartSig(ANFRAGE, String(NOW_SEC), sig, NOW_MS)).toEqual({ ok: true })
  })

  it('liefert missing_secret + loggt, wenn START_LINK_HMAC_SECRET fehlt (fail-closed)', () => {
    delete process.env.START_LINK_HMAC_SECRET
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sig = sign(ANFRAGE, FUTURE)
    expect(verifyStartSig(ANFRAGE, String(FUTURE), sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'missing_secret',
    })
    expect(errSpy).toHaveBeenCalledOnce()
  })

  it('liefert malformed bei fehlendem exp oder sig', () => {
    const sig = sign(ANFRAGE, FUTURE)
    expect(verifyStartSig(ANFRAGE, null, sig, NOW_MS)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyStartSig(ANFRAGE, String(FUTURE), null, NOW_MS)).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(verifyStartSig('', String(FUTURE), sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('liefert malformed bei nicht-numerischem exp', () => {
    const sig = sign(ANFRAGE, FUTURE)
    expect(verifyStartSig(ANFRAGE, '17e9', sig, NOW_MS)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyStartSig(ANFRAGE, '  123', sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('wirft NICHT bei nicht-hex / ungerader / falsch-langer sig (bad_sig statt throw)', () => {
    // Buffer.from(x,'hex') + timingSafeEqual koennten sonst werfen/still truncaten.
    expect(verifyStartSig(ANFRAGE, String(FUTURE), 'zzzz', NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
    expect(verifyStartSig(ANFRAGE, String(FUTURE), 'abc', NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
    expect(verifyStartSig(ANFRAGE, String(FUTURE), 'ab12', NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
  })

  it('lehnt Uppercase-Hex ab (Kontrakt = lowercase) → bad_sig', () => {
    const sig = sign(ANFRAGE, FUTURE).toUpperCase()
    expect(verifyStartSig(ANFRAGE, String(FUTURE), sig, NOW_MS)).toEqual({
      ok: false,
      reason: 'bad_sig',
    })
  })
})
