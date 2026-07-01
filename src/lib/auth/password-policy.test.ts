import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'crypto'
import { pruefePasswortStaerke, MIN_PASSWORT_LAENGE } from './password-policy'

// AAR-auth-haertung (Befund J): Passwort-Policy ≥12 + HIBP-Breach-Check
// (k-anonymity — nur die ersten 5 Hash-Zeichen verlassen uns). Fail-open:
// faellt HIBP aus, blockiert es das Passwort-Setzen NICHT.

const LANG = 'GutesLangesPasswort2026' // >= 12 Zeichen
const sha1Upper = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase()

function hibpFetch(body: string, ok = true) {
  return vi.fn(async () => ({ ok, text: async () => body })) as unknown as typeof fetch
}

describe('pruefePasswortStaerke', () => {
  it('lehnt zu kurze Passwoerter ab — ohne HIBP-Call', async () => {
    const f = vi.fn() as unknown as typeof fetch
    const res = await pruefePasswortStaerke('kurz123', f)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain(String(MIN_PASSWORT_LAENGE))
    expect(f).not.toHaveBeenCalled()
  })

  it('lehnt ein in Leaks bekanntes Passwort ab', async () => {
    const suffix = sha1Upper(LANG).slice(5)
    const body = `00000000000000000000000000000000001:3\r\n${suffix}:42\r\n`
    const res = await pruefePasswortStaerke(LANG, hibpFetch(body))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.toLowerCase()).toContain('leak')
  })

  it('akzeptiert ein langes, nicht geleaktes Passwort', async () => {
    const body = `00000000000000000000000000000000001:3\r\nABCDEF0123456789ABCDEF0123456789ABC:7\r\n`
    const res = await pruefePasswortStaerke(LANG, hibpFetch(body))
    expect(res.ok).toBe(true)
  })

  it('fail-open: HIBP wirft -> Passwort akzeptiert', async () => {
    const f = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect((await pruefePasswortStaerke(LANG, f)).ok).toBe(true)
  })

  it('fail-open: HIBP antwortet non-2xx -> Passwort akzeptiert', async () => {
    const res = await pruefePasswortStaerke(LANG, hibpFetch('', false))
    expect(res.ok).toBe(true)
  })

  it('k-anonymity: nur das 5-Zeichen-Praefix verlaesst uns', async () => {
    const f = hibpFetch('00000000000000000000000000000000001:3\r\n')
    await pruefePasswortStaerke(LANG, f)
    const full = sha1Upper(LANG)
    const url = (f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${full.slice(0, 5)}`)
    expect(url).not.toContain(full.slice(5)) // Suffix nie gesendet
    expect(url).not.toContain(LANG) // Passwort nie gesendet
  })
})
