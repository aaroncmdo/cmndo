import { describe, it, expect } from 'vitest'
import { mapArtikelToFeedItem, type WissenArtikel } from './db-articles'

function makeArtikel(overrides: Partial<WissenArtikel> = {}): WissenArtikel {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'nutzungsausfall-berechnen',
    title: 'Nutzungsausfall berechnen',
    body: '# Nutzungsausfall berechnen\n\n> **Kurz erklaert:** Nutzungsausfall ist der Anspruch ...',
    excerpt: 'Wer sein Fahrzeug unfallbedingt nicht nutzen kann, hat Anspruch auf Nutzungsausfall.',
    key_facts: ['§ 249 BGB', 'BGH VI ZR 100/10', 'Tabelle Sanden/Danner/Küppersbusch'],
    meta_description: 'Nutzungsausfall nach Unfall berechnen — Tabelle, Fristen, BGH.',
    primary_keyword: 'Nutzungsausfall berechnen',
    cluster: 'H3',
    artikel_typ: 'glossar-spoke',
    last_modified: '2026-06-15',
    veroeffentlicht_am: '2026-06-01T10:00:00Z',
    author: 'aaron-sprafke',
    ...overrides,
  }
}

describe('mapArtikelToFeedItem', () => {
  it('setzt link auf /wissen/<slug>', () => {
    const item = mapArtikelToFeedItem(makeArtikel())
    expect(item.link).toBe('/wissen/nutzungsausfall-berechnen')
  })

  it('setzt guid gleich link', () => {
    const item = mapArtikelToFeedItem(makeArtikel())
    expect(item.guid).toBe(item.link)
  })

  it('nimmt last_modified als pubDate wenn vorhanden', () => {
    const item = mapArtikelToFeedItem(makeArtikel({ last_modified: '2026-06-15' }))
    expect(item.pubDate).toEqual(new Date('2026-06-15'))
  })

  it('faellt auf veroeffentlicht_am zurueck wenn last_modified fehlt', () => {
    const item = mapArtikelToFeedItem(
      makeArtikel({ last_modified: null, veroeffentlicht_am: '2026-06-01T10:00:00Z' }),
    )
    expect(item.pubDate).toEqual(new Date('2026-06-01T10:00:00Z'))
  })

  it('nutzt Fallback-Datum wenn beide fehlen (kein build-time new Date())', () => {
    const item = mapArtikelToFeedItem(
      makeArtikel({ last_modified: null, veroeffentlicht_am: null }),
    )
    expect(item.pubDate).toEqual(new Date('2024-01-01T00:00:00Z'))
  })

  it('uebertraegt title korrekt', () => {
    const item = mapArtikelToFeedItem(makeArtikel({ title: 'Schmerzensgeld Tabelle 2026' }))
    expect(item.title).toBe('Schmerzensgeld Tabelle 2026')
  })

  it('uebertraegt excerpt korrekt', () => {
    const item = mapArtikelToFeedItem(makeArtikel())
    expect(item.excerpt).toBe(
      'Wer sein Fahrzeug unfallbedingt nicht nutzen kann, hat Anspruch auf Nutzungsausfall.',
    )
  })

  it('uebertraegt keyFacts korrekt', () => {
    const item = mapArtikelToFeedItem(makeArtikel())
    expect(item.keyFacts).toEqual([
      '§ 249 BGB',
      'BGH VI ZR 100/10',
      'Tabelle Sanden/Danner/Küppersbusch',
    ])
  })

  it('liefert leeres keyFacts-Array wenn key_facts leer', () => {
    const item = mapArtikelToFeedItem(makeArtikel({ key_facts: [] }))
    expect(item.keyFacts).toEqual([])
  })

  it('liefert leeres excerpt wenn excerpt null', () => {
    const item = mapArtikelToFeedItem(makeArtikel({ excerpt: null }))
    expect(item.excerpt).toBe('')
  })

  it('setzt author auf aaron-sprafke', () => {
    const item = mapArtikelToFeedItem(makeArtikel())
    expect(item.author).toBe('aaron-sprafke')
  })
})
