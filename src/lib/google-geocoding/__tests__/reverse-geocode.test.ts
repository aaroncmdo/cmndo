import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reverseGeocodeAddress } from '../geocode-address'

const originalFetch = global.fetch

describe('reverseGeocodeAddress', () => {
  beforeEach(() => { process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = 'test-key' })
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks() })

  it('ruft die latlng-Geocoding-API und liefert die formatierte Adresse', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ status: 'OK', results: [{ formatted_address: 'Musterstr. 1, 50937 Köln', place_id: 'p1' }] }),
    })
    global.fetch = fetchMock as never
    const r = await reverseGeocodeAddress(50.9, 6.9)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.formatted_address).toBe('Musterstr. 1, 50937 Köln')
    expect(String(fetchMock.mock.calls[0][0])).toContain('latlng=50.9,6.9')
  })
  it('leere Ergebnisse → ok:false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ status: 'ZERO_RESULTS', results: [] }) }) as never
    const r = await reverseGeocodeAddress(0, 0)
    expect(r.ok).toBe(false)
  })
})
