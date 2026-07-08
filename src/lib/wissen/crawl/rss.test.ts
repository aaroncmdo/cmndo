import { describe, it, expect } from 'vitest'
import { parseRssFeed } from './rss'
import { sourceHash } from './index'

// ---------------------------------------------------------------------------
// RSS 2.0 Fixture
// ---------------------------------------------------------------------------

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.de</link>
    <item>
      <title>Erstes Urteil zu Schadensersatz</title>
      <description>Der BGH hat entschieden, dass Rueckstufungsschaeden ersetzt werden muessen.</description>
      <link>https://example.de/artikel/1</link>
    </item>
    <item>
      <title>Neue Rechtsprechung 2026</title>
      <description>Aktuelle Urteile zur Wertminderung nach Unfall.</description>
      <link>https://example.de/artikel/2</link>
    </item>
  </channel>
</rss>`

// ---------------------------------------------------------------------------
// Atom Fixture
// ---------------------------------------------------------------------------

const ATOM_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom-Test-Feed</title>
  <entry>
    <title>Atom-Beitrag: Gutachten und Haftung</title>
    <summary>Eine Analyse der aktuellen BGH-Rechtsprechung zu Sachverstaendigenkosten.</summary>
    <link href="https://example.de/atom/1" rel="alternate"/>
  </entry>
</feed>`

// ---------------------------------------------------------------------------
// Fixture mit Entities und CDATA
// ---------------------------------------------------------------------------

const ENTITY_CDATA_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Entity-Feed</title>
    <item>
      <title><![CDATA[A & B]]></title>
      <description>Preis &amp; Leistung sind entscheidend &lt;wichtig&gt;.</description>
      <link>https://example.de/entity/1</link>
    </item>
    <item>
      <title>A &amp; B</title>
      <description>Test &lt;b&gt;fett&lt;/b&gt; mit HTML-Tags.</description>
      <link>https://example.de/entity/2</link>
    </item>
  </channel>
</rss>`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseRssFeed', () => {
  it('parst RSS 2.0 mit 2 Items und gibt korrekte Felder zurueck', () => {
    const items = parseRssFeed(RSS_FIXTURE, 'TestQuelle')
    expect(items).toHaveLength(2)

    expect(items[0].title).toBe('Erstes Urteil zu Schadensersatz')
    expect(items[0].summary).toContain('Rueckstufungsschaeden')
    expect(items[0].link).toBe('https://example.de/artikel/1')
    expect(items[0].sourceName).toBe('TestQuelle')

    expect(items[1].title).toBe('Neue Rechtsprechung 2026')
    expect(items[1].link).toBe('https://example.de/artikel/2')
    expect(items[1].sourceName).toBe('TestQuelle')
  })

  it('parst Atom-Feed mit 1 Entry und liest link href korrekt', () => {
    const items = parseRssFeed(ATOM_FIXTURE, 'AtomQuelle')
    expect(items).toHaveLength(1)

    expect(items[0].title).toBe('Atom-Beitrag: Gutachten und Haftung')
    expect(items[0].summary).toContain('BGH-Rechtsprechung')
    expect(items[0].link).toBe('https://example.de/atom/1')
    expect(items[0].sourceName).toBe('AtomQuelle')
  })

  it('dekodiert CDATA-Wrapper: Titel wird zu "A & B"', () => {
    const items = parseRssFeed(ENTITY_CDATA_FIXTURE, 'EntityQuelle')
    expect(items).toHaveLength(2)
    // Item 1: CDATA title
    expect(items[0].title).toBe('A & B')
  })

  it('dekodiert &amp; Entity: Titel wird zu "A & B"', () => {
    const items = parseRssFeed(ENTITY_CDATA_FIXTURE, 'EntityQuelle')
    // Item 2: &amp; entity in title
    expect(items[1].title).toBe('A & B')
  })

  it('entfernt HTML-Tags aus summary', () => {
    const items = parseRssFeed(ENTITY_CDATA_FIXTURE, 'EntityQuelle')
    // Item 2 description hat <b>fett</b> — tags sollen entfernt werden
    expect(items[1].summary).not.toContain('<b>')
    expect(items[1].summary).not.toContain('</b>')
    expect(items[1].summary).toContain('fett')
  })

  it('dekodiert &lt; und &gt; Entities und entfernt daraus resultierende Tags', () => {
    const items = parseRssFeed(ENTITY_CDATA_FIXTURE, 'EntityQuelle')
    // Item 1 description: "Preis &amp; Leistung sind entscheidend &lt;wichtig&gt;."
    // &amp; -> &, &lt;wichtig&gt; -> <wichtig> -> tag-stripped (komplett entfernt)
    expect(items[0].summary).not.toContain('&lt;')
    expect(items[0].summary).not.toContain('&gt;')
    expect(items[0].summary).not.toContain('&amp;')
    // Das &amp; -> & soll korrekt dekodiert sein
    expect(items[0].summary).toContain('&')
    // Kerntext bleibt erhalten
    expect(items[0].summary).toContain('Preis')
    expect(items[0].summary).toContain('Leistung')
  })

  it('gibt [] zurueck fuer unparseable Input', () => {
    expect(parseRssFeed('not xml', 'Test')).toEqual([])
    expect(parseRssFeed('', 'Test')).toEqual([])
    expect(parseRssFeed('{ json: true }', 'Test')).toEqual([])
  })

  it('ueberspringt Items ohne Titel', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title></title>
    <description>Kein Titel vorhanden.</description>
    <link>https://example.de/no-title</link>
  </item>
  <item>
    <title>Mit Titel</title>
    <description>Hat einen Titel.</description>
    <link>https://example.de/with-title</link>
  </item>
</channel></rss>`
    const items = parseRssFeed(xml, 'Test')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Mit Titel')
  })

  it('ueberspringt Items ohne Link', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>Kein Link</title>
    <description>Dieser Artikel hat keinen Link.</description>
    <link></link>
  </item>
  <item>
    <title>Hat Link</title>
    <description>Mit Link.</description>
    <link>https://example.de/ok</link>
  </item>
</channel></rss>`
    const items = parseRssFeed(xml, 'Test')
    expect(items).toHaveLength(1)
    expect(items[0].link).toBe('https://example.de/ok')
  })
})

// ---------------------------------------------------------------------------
// sourceHash Tests
// ---------------------------------------------------------------------------

describe('sourceHash', () => {
  it('gibt einen 64-stelligen Hex-String zurueck', () => {
    const hash = sourceHash('https://a.example')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ist deterministisch (gleiche URL -> gleicher Hash)', () => {
    const url = 'https://www.lto.de/rss/nachrichten/'
    expect(sourceHash(url)).toBe(sourceHash(url))
  })

  it('verschiedene URLs ergeben verschiedene Hashes', () => {
    const h1 = sourceHash('https://feed.a.example/rss')
    const h2 = sourceHash('https://feed.b.example/rss')
    expect(h1).not.toBe(h2)
  })

  it('leere URL ergibt stabilen Hash (kein throw)', () => {
    expect(() => sourceHash('')).not.toThrow()
    const h = sourceHash('')
    expect(h).toHaveLength(64)
  })
})
