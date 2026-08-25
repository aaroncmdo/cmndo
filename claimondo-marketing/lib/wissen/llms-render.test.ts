import { describe, it, expect } from 'vitest'
import {
  artikelStand,
  artikelIndexLine,
  artikelFullBlock,
  renderArtikelIndexSection,
  renderArtikelFullSection,
} from './llms-render'
import type { WissenArtikel } from './db-articles'

function makeArtikel(overrides: Partial<WissenArtikel> = {}): WissenArtikel {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'wertminderung-berechnen',
    title: 'Wertminderung berechnen',
    body: '# Wertminderung berechnen\n\n> **Kurz erklärt:** …\n\n## Häufige Fragen\n**Was?**\nAntwort.',
    excerpt: 'Merkantile Wertminderung nach Unfall – Formel und BGH-Linie.',
    key_facts: ['§ 251 BGB', 'BGH VI ZR 35/22'],
    meta_description: 'Wertminderung nach Unfall berechnen.',
    // NULL = der Normalfall: ohne gepflegten SERP-Titel faellt die Seite auf `title` zurueck.
    meta_title: null,
    // NULL = ohne Tags rendert die Sektion „Passend zum Thema" nichts (WissenVerwandteThemen).
    tags: null,
    primary_keyword: 'Wertminderung berechnen',
    cluster: 'H3',
    artikel_typ: 'glossar-spoke',
    last_modified: '2026-07-10',
    veroeffentlicht_am: '2026-07-09T08:00:00Z',
    author: 'aaron-sprafke',
    audience: 'consumer',
    quelle: 'redaktion',
    ...overrides,
  }
}

describe('artikelStand', () => {
  it('nimmt last_modified wenn vorhanden', () => {
    expect(artikelStand(makeArtikel({ last_modified: '2026-07-10' }))).toBe('2026-07-10')
  })
  it('faellt auf veroeffentlicht_am (nur Datumsteil)', () => {
    expect(artikelStand(makeArtikel({ last_modified: null }))).toBe('2026-07-09')
  })
  it('leerer String wenn beide fehlen', () => {
    expect(artikelStand(makeArtikel({ last_modified: null, veroeffentlicht_am: null }))).toBe('')
  })
})

describe('artikelIndexLine', () => {
  it('enthaelt Titel, Link, Excerpt, Stand und Fakten', () => {
    const line = artikelIndexLine(makeArtikel())
    expect(line).toContain('[Wertminderung berechnen](https://claimondo.de/wissen/wertminderung-berechnen)')
    expect(line).toContain('– Merkantile Wertminderung')
    expect(line).toContain('(Stand: 2026-07-10)')
    expect(line).toContain('Fakten: § 251 BGB; BGH VI ZR 35/22')
  })
  it('laesst Fakten-Teil weg wenn key_facts leer', () => {
    expect(artikelIndexLine(makeArtikel({ key_facts: [] }))).not.toContain('Fakten:')
  })
})

describe('artikelFullBlock', () => {
  it('mirror des assetBlock-Formats (---, Kommentar, Canonical, body)', () => {
    const block = artikelFullBlock(makeArtikel())
    expect(block).toContain('\n---\n')
    expect(block).toContain('<!-- Canonical: https://claimondo.de/wissen/wertminderung-berechnen -->')
    expect(block).toContain('# Wertminderung berechnen')
  })
})

describe('renderArtikelIndexSection', () => {
  it('leerer String wenn beide leer', () => {
    expect(renderArtikelIndexSection([], [])).toBe('')
  })
  it('nur besetzte Subsektionen erscheinen', () => {
    const out = renderArtikelIndexSection([makeArtikel({ slug: 'c' })], [])
    expect(out).toContain('### Ratgeber für Geschädigte')
    expect(out).not.toContain('### Fachartikel')
  })
})

describe('renderArtikelFullSection', () => {
  it('leerer String wenn beide leer', () => {
    expect(renderArtikelFullSection([], [])).toBe('')
  })
  it('enthaelt beide Subsektionen wenn besetzt', () => {
    const out = renderArtikelFullSection(
      [makeArtikel({ slug: 'c', audience: 'consumer' })],
      [makeArtikel({ slug: 'b', audience: 'b2b' })],
    )
    expect(out).toContain('# AKTUELLE ARTIKEL')
    expect(out).toContain('## Ratgeber für Geschädigte')
    expect(out).toContain('## Fachartikel für die Branche')
  })
})
