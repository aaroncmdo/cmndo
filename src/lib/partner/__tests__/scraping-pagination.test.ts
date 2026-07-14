import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scrapeGooglePlaces } from '../scraping'

// Regression 14.07.: Googles Legacy-Pagination (next_page_token) liefert seit dem
// Places-Legacy-Sunset zuverlaessig INVALID_REQUEST — auch nach 10s Reifezeit
// (live gegen die echte API verifiziert). Der Scraper hat daraufhin die BEREITS
// geholten Treffer von Seite 1 weggeworfen und einen Fehler geliefert
// -> jede stadtweite Suche schlug fehl ("Suche fehlgeschlagen"), und es wurde
// NIE ein Lead importiert (prod: 0 Leads mit source_channel='scraping').

const treffer = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    place_id: `p${i}`,
    name: `Werkstatt ${i}`,
    formatted_address: 'Teststr. 1, 10115 Berlin',
  }))

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('scrapeGooglePlaces — Pagination', () => {
  it('behaelt Seite-1-Treffer, wenn die FOLGEseite INVALID_REQUEST liefert', async () => {
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        call++
        // 1. Call = textsearch Seite 1 (OK + next_page_token)
        if (call === 1) {
          return new Response(
            JSON.stringify({ status: 'OK', results: treffer(3), next_page_token: 'TOK' }),
            { status: 200 },
          )
        }
        // 2. Call = textsearch Seite 2 mit pagetoken -> das kaputte Google-Verhalten
        if (String(input).includes('pagetoken')) {
          return new Response(JSON.stringify({ status: 'INVALID_REQUEST' }), { status: 200 })
        }
        // Danach: Details-Calls je Treffer
        return new Response(
          JSON.stringify({ status: 'OK', result: { formatted_phone_number: '030 1', website: 'https://x.de' } }),
          { status: 200 },
        )
      }),
    )

    const res = await scrapeGooglePlaces({ rolle: 'werkstatt', region: 'Berlin', limit: 20 })

    expect(res.ok, 'darf NICHT fehlschlagen, nur weil Seite 2 kaputt ist').toBe(true)
    if (res.ok) {
      expect(res.kandidaten).toHaveLength(3) // die 3 guten Treffer von Seite 1
      expect(res.kandidaten[0].website).toBe('https://x.de') // Website wird mitgenommen
    }
  }, 20_000)

  it('meldet einen echten Fehler, wenn schon die ERSTE Seite bricht', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'REQUEST_DENIED' }), { status: 200 })),
    )
    const res = await scrapeGooglePlaces({ rolle: 'werkstatt', region: 'Berlin', limit: 20 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('REQUEST_DENIED')
  })
})
