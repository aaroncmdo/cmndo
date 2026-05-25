import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseGaClientId, sendGa4Event } from '../ga4-mp'

describe('parseGaClientId', () => {
  it('extracts client_id from a standard _ga cookie', () => {
    expect(parseGaClientId('GA1.1.1980030788.1716000000')).toBe('1980030788.1716000000')
  })
  it('handles the GA1.2 variant', () => {
    expect(parseGaClientId('GA1.2.123456789.987654321')).toBe('123456789.987654321')
  })
  it('returns null for missing / malformed cookies', () => {
    expect(parseGaClientId(null)).toBeNull()
    expect(parseGaClientId(undefined)).toBeNull()
    expect(parseGaClientId('')).toBeNull()
    expect(parseGaClientId('GA1.1')).toBeNull()
  })
})

describe('sendGa4Event', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('skips (no fetch) when measurement-id / api-secret are not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', '')
    vi.stubEnv('GA4_MP_API_SECRET', '')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await sendGa4Event({ clientId: 'x.y', events: [{ name: 'generate_lead' }] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips when clientId is empty (no consent / no stored id)', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-TEST123')
    vi.stubEnv('GA4_MP_API_SECRET', 'secret')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await sendGa4Event({ clientId: '', events: [{ name: 'generate_lead' }] })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('POSTs to the MP endpoint with client_id + events when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-TEST123')
    vi.stubEnv('GA4_MP_API_SECRET', 'secret')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await sendGa4Event({
      clientId: '111.222',
      events: [{ name: 'sa_signed', params: { value: 250, currency: 'EUR' } }],
      consentGranted: true,
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('https://www.google-analytics.com/mp/collect')
    expect(String(url)).toContain('measurement_id=G-TEST123')
    expect(String(url)).toContain('api_secret=secret')
    const body = JSON.parse(init.body as string)
    expect(body.client_id).toBe('111.222')
    expect(body.events[0].name).toBe('sa_signed')
    expect(body.events[0].params.value).toBe(250)
    expect(body.consent.ad_user_data).toBe('GRANTED')
  })

  it('never throws — swallows fetch errors (fire-and-forget)', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ID', 'G-TEST123')
    vi.stubEnv('GA4_MP_API_SECRET', 'secret')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    await expect(
      sendGa4Event({ clientId: '1.2', events: [{ name: 'generate_lead' }] }),
    ).resolves.toBeUndefined()
  })
})
