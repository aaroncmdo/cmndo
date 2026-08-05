import { describe, it, expect, vi, beforeEach } from 'vitest'

type Result = { data: unknown; error: unknown }

function makeQuery(result: Result) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.order = () => q
  q.single = async () => result
  q.maybeSingle = async () => result
  q.then = (resolve: (v: Result) => unknown) => Promise.resolve(result).then(resolve)
  return q
}

const from = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from }),
}))

import { getEmbedSiteDetail } from './queries'

const ROW = {
  id: 'e1',
  name: 'Muster-Embed',
  slug: 'muster',
  variante: 'a',
  aktiv: true,
  funnel_modus: 'direkt',
  paused_grund: null,
  sv_id: 'sv1',
  inhaber_profile_id: 'p1',
  sv_telefon: null,
  empfaenger_email: 'lead@muster.de',
  cc_email: null,
  baileys_routing_nummer: '+4930',
  erlaubte_domains: ['muster.de', 'www.muster.de'],
  max_anfragen_pro_h: 20,
  einzelpreis_eur: 49,
  anfragen_gesamt: 7,
  letzte_anfrage_am: '2026-07-01T10:00:00Z',
  config_hits: 3,
  letzter_config_hit_am: '2026-08-01T12:00:00Z',
  letzter_config_origin: 'sv-muster.de',
  agb_akzeptiert_am: '2026-01-01T00:00:00Z',
  agb_version: 'v2',
  tracking_webhook_url: 'https://hook.muster.de',
  tracking_webhook_secret: 'super-geheim',
  tracking_webhook_last_status: 'error',
  tracking_webhook_last_error: '502 Bad Gateway',
  tracking_webhook_last_at: '2026-07-02T09:00:00Z',
  tracking_ga4_measurement_id: 'G-123',
  tracking_gads_conversion_id: null,
  tracking_gads_conversion_label: null,
  tracking_gads_customer_id: null,
  erstellt_am: '2026-01-01T00:00:00Z',
  updated_at: '2026-07-02T09:00:00Z',
}

beforeEach(() => from.mockReset())

describe('getEmbedSiteDetail', () => {
  it('liefert ok:false bei Query-Fehler', async () => {
    from.mockReturnValueOnce(makeQuery({ data: null, error: { message: 'boom' } }))
    expect(await getEmbedSiteDetail('e1')).toEqual({ ok: false, error: 'boom' })
  })

  it('mappt die operativ wichtigen Felder, die die Liste versteckt', async () => {
    from.mockReturnValueOnce(makeQuery({ data: ROW, error: null }))
    const res = await getEmbedSiteDetail('e1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.einzelpreisEur).toBe(49)
    expect(res.data.maxAnfragenProH).toBe(20)
    expect(res.data.erlaubteDomains).toEqual(['muster.de', 'www.muster.de'])
    expect(res.data.webhookLastStatus).toBe('error')
    expect(res.data.webhookLastError).toBe('502 Bad Gateway')
    expect(res.data.configHits).toBe(3)
    expect(res.data.letzterConfigOrigin).toBe('sv-muster.de')
  })

  it('config_hits=null (Alt-Row) wird zu 0', async () => {
    from.mockReturnValueOnce(makeQuery({ data: { ...ROW, config_hits: null }, error: null }))
    const res = await getEmbedSiteDetail('e1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.configHits).toBe(0)
  })

  it('gibt das Webhook-Secret NIE aus — nur ob eins gesetzt ist', async () => {
    from.mockReturnValueOnce(makeQuery({ data: ROW, error: null }))
    const res = await getEmbedSiteDetail('e1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.hatWebhookSecret).toBe(true)
    // das Secret darf in KEINEM Feld des Detail-Objekts auftauchen
    expect(JSON.stringify(res.data)).not.toContain('super-geheim')
  })

  it('erlaubte_domains=null wird zu []', async () => {
    from.mockReturnValueOnce(makeQuery({ data: { ...ROW, erlaubte_domains: null }, error: null }))
    const res = await getEmbedSiteDetail('e1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.erlaubteDomains).toEqual([])
  })
})
