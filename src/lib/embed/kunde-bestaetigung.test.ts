import { describe, it, expect } from 'vitest'
import { svBezeichnung, kundenBestaetigungText, CLUSTER_STADT } from './kunde-bestaetigung'

describe('svBezeichnung', () => {
  it('Cluster wuppertal → Sachverständiger Wuppertal', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'wuppertal' }, null)).toBe('Sachverständiger Wuppertal'))
  it('Cluster duesseldorf → echtes Ü', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'duesseldorf' }, null)).toBe('Sachverständiger Düsseldorf'))
  it('Cluster bonn', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'bonn' }, null)).toBe('Sachverständiger Bonn'))
  it('Cluster unbekannt → generisch', () =>
    expect(svBezeichnung({ source: 'kfz_gutachter_lp', cluster: 'xyz' }, null)).toBe('Ihrem Sachverständigen'))
  it('sv_embed → embed_sites.name', () =>
    expect(svBezeichnung({ source: 'sv_embed', cluster: null }, 'KFZ-Gutachter Müller')).toBe('KFZ-Gutachter Müller'))
  it('sv_embed ohne name → generisch', () =>
    expect(svBezeichnung({ source: 'sv_embed', cluster: null }, null)).toBe('Ihrem Sachverständigen'))
})

describe('kundenBestaetigungText', () => {
  it('Sie-Anrede + claimondo.de-Link', () => {
    const t = kundenBestaetigungText('Sachverständiger Bonn')
    expect(t).toBe('Vielen Dank für Ihre Anfrage bei Sachverständiger Bonn. Wir melden uns schnellstmöglich bei Ihnen. Mehr über uns: https://claimondo.de')
  })
})

describe('CLUSTER_STADT', () => {
  it('hat die 3 Cluster mit Umlaut', () =>
    expect(CLUSTER_STADT).toEqual({ wuppertal: 'Wuppertal', duesseldorf: 'Düsseldorf', bonn: 'Bonn' }))
})
