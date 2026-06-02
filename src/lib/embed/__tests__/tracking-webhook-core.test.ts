import { describe, it, expect, vi } from 'vitest'
import {
  buildTrackingPayload,
  signPayload,
  postWithRetry,
  type TrackingGfaRow,
} from '../tracking-webhook-core'

const gfa: TrackingGfaRow = {
  id: 'anf-1',
  vorname: 'Erika',
  nachname: 'Musterfrau',
  gclid: 'gc-123',
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'kfz',
  utm_term: null,
  utm_content: null,
  ga_client_id: 'GA1.2.3',
}

describe('buildTrackingPayload', () => {
  it('mappt gfa-Felder + Name + ts; value_eur nur bei termin_durchgefuehrt', () => {
    const p = buildTrackingPayload({
      event: 'anfrage_eingegangen',
      gfa,
      embedSiteSlug: 'kanzlei-mueller',
      valueEur: null,
      ts: '2026-06-02T10:00:00.000Z',
    })
    expect(p).toEqual({
      event: 'anfrage_eingegangen',
      anfrage_id: 'anf-1',
      embed_site_slug: 'kanzlei-mueller',
      name: 'Erika Musterfrau',
      gclid: 'gc-123',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'kfz',
      utm_term: null,
      utm_content: null,
      ga_client_id: 'GA1.2.3',
      value_eur: null,
      ts: '2026-06-02T10:00:00.000Z',
    })
  })

  it('setzt name null wenn vorname+nachname leer', () => {
    const p = buildTrackingPayload({
      event: 'termin_durchgefuehrt',
      gfa: { ...gfa, vorname: null, nachname: null },
      embedSiteSlug: 's',
      valueEur: 70,
      ts: '2026-06-02T10:00:00.000Z',
    })
    expect(p.name).toBeNull()
    expect(p.value_eur).toBe(70)
  })
})

describe('signPayload', () => {
  it('liefert deterministische sha256-HMAC mit Prefix', () => {
    // HMAC-SHA256("hello", key="secret")
    expect(signPayload('hello', 'secret')).toBe(
      'sha256=88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b',
    )
  })

  it('verschiedene Secrets -> verschiedene Signatur', () => {
    expect(signPayload('hello', 'a')).not.toBe(signPayload('hello', 'b'))
  })
})

describe('postWithRetry', () => {
  const noSleep = () => Promise.resolve()

  it('Erfolg beim ersten Versuch -> ein fetch-Call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response)
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep })
    expect(res).toEqual({ ok: true, status: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('500 dann 200 -> Retry, am Ende ok', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep })
    expect(res.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('3x 500 -> finaler Fail mit Status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response)
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep })
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('Netzwerk-Throw -> status null, error gesetzt', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await postWithRetry('https://x', '{}', 'sig', { fetchImpl, sleep: noSleep, attempts: 2 })
    expect(res.ok).toBe(false)
    expect(res.status).toBeNull()
    expect(res.error).toContain('ECONNREFUSED')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
