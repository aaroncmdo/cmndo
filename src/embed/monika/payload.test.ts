import { describe, it, expect } from 'vitest'
import { buildPayloadFromAnswers } from './payload'
import type { Answers } from './flow-script'
import type { MonikaConfig } from './types'

const cfg = {
  source: 'sv_embed',
  base: 'https://claimondo.de',
  embedSiteSlug: 'sv-test',
  siteToken: 'tok',
  cluster: null,
  stadtSlug: null,
} as unknown as MonikaConfig

describe('buildPayloadFromAnswers', () => {
  it('mappt Answers + cfg in AnfragePayload', () => {
    const a: Answers = {
      anliegen: 'haftpflichtgutachten',
      unfalltyp: 'auffahrunfall',
      schuld_einschaetzung: 'unverschuldet',
      wunsch_tag: 'morgen',
      wunsch_zeit: 'vormittag',
      vorname: 'Max',
      nachname: 'Mustermann',
      telefon: '0151 1',
    }
    const p = buildPayloadFromAnswers(a, cfg, { page_url: 'https://x.de', consent_ts: '2026-06-06T00:00:00Z', honeypot: '' })
    expect(p.name).toBe('Max Mustermann')
    expect(p.telefon).toBe('0151 1')
    expect(p.anliegen).toBe('haftpflichtgutachten')
    expect(p.wunsch_tag).toBe('morgen')
    expect(p.source).toBe('sv_embed')
    expect(p.embed_site_slug).toBe('sv-test')
    expect(p.site_token).toBe('tok')
  })

  it('nur Vorname → name = Vorname', () => {
    const p = buildPayloadFromAnswers({ anliegen: 'gegengutachten', vorname: 'Max', telefon: '0151 1' }, cfg, {})
    expect(p.name).toBe('Max')
  })
})
