import { describe, it, expect } from 'vitest'
import { mapArtikelToFeedItem, mergeAndSortItems, groupByAudience, type WissenArtikel } from './db-articles'
import type { FeedItem } from '@/lib/feed/types'

function makeArtikel(overrides: Partial<WissenArtikel> = {}): WissenArtikel {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'nutzungsausfall-berechnen',
    title: 'Nutzungsausfall berechnen',
    body: '# Nutzungsausfall berechnen\n\n> **Kurz erklaert:** Nutzungsausfall ist der Anspruch ...',
    excerpt: 'Wer sein Fahrzeug unfallbedingt nicht nutzen kann, hat Anspruch auf Nutzungsausfall.',
    key_facts: ['§ 249 BGB', 'BGH VI ZR 100/10', 'Tabelle Sanden/Danner/Küppersbusch'],
    meta_description: 'Nutzungsausfall nach Unfall berechnen — Tabelle, Fristen, BGH.',
    // NULL = der Normalfall: ohne gepflegten SERP-Titel faellt die Seite auf `title` zurueck.
    meta_title: null,
    // NULL = ohne Tags rendert die Sektion „Passend zum Thema" nichts (WissenVerwandteThemen).
    tags: null,
    primary_keyword: 'Nutzungsausfall berechnen',
    cluster: 'H3',
    artikel_typ: 'glossar-spoke',
    last_modified: '2026-06-15',
    veroeffentlicht_am: '2026-06-01T10:00:00Z',
    author: 'aaron-sprafke',
    audience: 'consumer',
    quelle: 'redaktion',
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

// ----- mergeAndSortItems -----

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: 'Test-Artikel',
    link: '/wissen/test',
    guid: '/wissen/test',
    pubDate: new Date('2026-01-01T00:00:00Z'),
    assetType: 'Spoke',
    categories: [],
    author: 'aaron-sprafke',
    excerpt: '',
    keyFacts: [],
    sortKey: '6-wissen--test',
    ...overrides,
  }
}

describe('mergeAndSortItems', () => {
  it('sortiert nach pubDate desc (neueste zuerst)', () => {
    const older = makeFeedItem({ guid: '/a', pubDate: new Date('2025-01-01') })
    const newer = makeFeedItem({ guid: '/b', pubDate: new Date('2026-06-01') })
    const result = mergeAndSortItems([older], [newer])
    expect(result[0].guid).toBe('/b')
    expect(result[1].guid).toBe('/a')
  })

  it('dedupiert nach guid (erster Treffer gewinnt)', () => {
    const mdx = makeFeedItem({ guid: '/wissen/duplikat', title: 'MDX-Version' })
    const db = makeFeedItem({ guid: '/wissen/duplikat', title: 'DB-Version' })
    const result = mergeAndSortItems([mdx], [db])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('MDX-Version')
  })

  it('gibt leere Liste zurueck wenn beide Inputs leer', () => {
    expect(mergeAndSortItems([], [])).toEqual([])
  })

  it('gibt alle Items zurueck wenn keine Duplikate', () => {
    const a = makeFeedItem({ guid: '/a', pubDate: new Date('2026-03-01') })
    const b = makeFeedItem({ guid: '/b', pubDate: new Date('2026-05-01') })
    const c = makeFeedItem({ guid: '/c', pubDate: new Date('2026-01-01') })
    const result = mergeAndSortItems([a], [b, c])
    expect(result).toHaveLength(3)
    expect(result.map((x) => x.guid)).toEqual(['/b', '/a', '/c'])
  })
})

// ----- groupByAudience -----

describe('groupByAudience', () => {
  it('teilt nach audience in consumer und b2b', () => {
    const c = makeArtikel({ slug: 'c1', audience: 'consumer' })
    const b = makeArtikel({ slug: 'b1', audience: 'b2b' })
    const { consumer, b2b } = groupByAudience([c, b])
    expect(consumer.map((x) => x.slug)).toEqual(['c1'])
    expect(b2b.map((x) => x.slug)).toEqual(['b1'])
  })

  it('unbekannte/leere audience faellt auf consumer', () => {
    const x = makeArtikel({ slug: 'x', audience: '' })
    const { consumer, b2b } = groupByAudience([x])
    expect(consumer).toHaveLength(1)
    expect(b2b).toHaveLength(0)
  })

  it('erhaelt die Reihenfolge (newest-first bleibt)', () => {
    const a = makeArtikel({ slug: 'a', audience: 'b2b' })
    const b = makeArtikel({ slug: 'b', audience: 'b2b' })
    const { b2b } = groupByAudience([a, b])
    expect(b2b.map((x) => x.slug)).toEqual(['a', 'b'])
  })
})
