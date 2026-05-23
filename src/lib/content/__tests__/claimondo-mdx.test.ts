import { describe, it, expect } from 'vitest'
import {
  getAllAssets, getCornerstones, getHaftpflichtSpokes, getDecoder, getSachverstaendige, groupSpokesByCluster,
  extractSchemaJson, stripSchemaSection, stripLeadingSnippet,
  extractHeadings, extractTrustChips, isInternalHref, readingTimeMin, extractFaqPairs,
} from '../claimondo-mdx'

// Regression: parseFrontmatter warf bei mehrzeiligen `related:`-Arrays
// (`'' ?? []` ergab '' statt [], dann `''.push()` -> TypeError). getAllAssets()
// darf die 69 Files ohne Crash parsen.
describe('claimondo content discovery', () => {
  it('liest 77 Assets ohne Crash (2/57/10/8 — inkl. Pillar-C SV-Spokes)', () => {
    expect(getCornerstones().length).toBe(2)
    expect(getHaftpflichtSpokes().length).toBe(57)
    expect(getDecoder().length).toBe(10)
    expect(getSachverstaendige().length).toBe(8)
    expect(getAllAssets().length).toBe(77)
  })

  it('gruppiert Spokes nach Cluster (H1/H2/H3/H4/H6/H7)', () => {
    const g = groupSpokesByCluster()
    expect(Object.keys(g).length).toBeGreaterThan(0)
  })

  it('parst mehrzeiliges related zu einem Array (oder undefined), nie String', () => {
    for (const a of getAllAssets()) {
      expect(['object', 'undefined']).toContain(typeof a.related)
      if (a.related) expect(Array.isArray(a.related)).toBe(true)
    }
    const spoke = getHaftpflichtSpokes().find((a) => a.slug === '4-wochen-frist')
    expect(spoke?.related?.length ?? 0).toBeGreaterThan(0)
  })
})

const SAMPLE = `# Titel

> **Kurz erklärt:** Das ist die Antwort.

---

## Worum es geht

Text mit § 286 BGB und BGH VI ZR 235/13 als Referenz.

## Wie lange?

Mehr Text.

---

## Schema (JSON-LD)

\`\`\`json
{ "@context": "https://schema.org", "@type": "Article", "headline": "Titel" }
\`\`\`

---
`

describe('extractSchemaJson', () => {
  it('extrahiert den JSON-Block unter ## Schema', () => {
    const json = extractSchemaJson(SAMPLE)
    expect(json).toContain('"@type": "Article"')
    expect(JSON.parse(json!)).toMatchObject({ '@type': 'Article' })
  })
  it('gibt null zurück wenn kein Schema-Block', () => {
    expect(extractSchemaJson('# Nur Titel\n\nText')).toBeNull()
  })
})

describe('stripSchemaSection', () => {
  it('entfernt die ## Schema-Sektion samt Codeblock', () => {
    const out = stripSchemaSection(SAMPLE)
    expect(out).not.toContain('Schema (JSON-LD)')
    expect(out).not.toContain('@context')
    expect(out).toContain('## Worum es geht')
  })
})

describe('stripLeadingSnippet', () => {
  it('entfernt das erste Kurz-erklärt-Blockquote', () => {
    const out = stripLeadingSnippet(SAMPLE)
    expect(out).not.toContain('Kurz erklärt')
    expect(out).toContain('## Worum es geht')
    expect(out).toContain('# Titel')
  })
})

describe('extractHeadings', () => {
  it('liefert H2 mit slug-id und text (ohne Schema-H2)', () => {
    const hs = extractHeadings(stripSchemaSection(SAMPLE))
    expect(hs).toEqual([
      { id: 'worum-es-geht', text: 'Worum es geht' },
      { id: 'wie-lange', text: 'Wie lange?' },
    ])
  })
})

describe('extractTrustChips', () => {
  it('findet §- und BGH-Treffer, max 2', () => {
    const chips = extractTrustChips(SAMPLE)
    expect(chips).toContain('BGH VI ZR 235/13')
    expect(chips.length).toBeLessThanOrEqual(2)
  })
})

describe('isInternalHref', () => {
  it('erkennt interne Pfade und claimondo.de-Absolut-URLs', () => {
    expect(isInternalHref('/haftpflicht/x')).toBe(true)
    expect(isInternalHref('#anker')).toBe(true)
    expect(isInternalHref('https://claimondo.de/check')).toBe(true)
    expect(isInternalHref('https://gesetze-im-internet.de')).toBe(false)
  })
})

describe('readingTimeMin', () => {
  it('rechnet ~200 WPM, min 1', () => {
    expect(readingTimeMin('a '.repeat(400))).toBe(2)
    expect(readingTimeMin('kurz')).toBe(1)
  })
})

const SAMPLE_FAQ = `# Titel

## Worum es geht

Text.

## Häufige Fragen

**Gilt auf dem Parkplatz rechts vor links?**
Nur bei Fahrgassen mit Straßencharakter. Bei reinen Flächen: gegenseitige Rücksicht.

**Was bei Türöffnen?**
Siehe [Türöffnen](/haftpflicht/tueroeffnen) — 100 : 0 zu Lasten Türöffnender.

---

## Verwandte Begriffe
`

describe('extractFaqPairs', () => {
  it('parst **Frage?** + Antwort-Paare aus der Häufige-Fragen-Sektion', () => {
    const pairs = extractFaqPairs(SAMPLE_FAQ)
    expect(pairs).toHaveLength(2)
    expect(pairs[0].question).toBe('Gilt auf dem Parkplatz rechts vor links?')
    expect(pairs[0].answer).toContain('gegenseitige Rücksicht')
  })
  it('reduziert Markdown-Links in der Antwort auf reinen Text', () => {
    const pairs = extractFaqPairs(SAMPLE_FAQ)
    expect(pairs[1].answer).toContain('Türöffnen — 100 : 0')
    expect(pairs[1].answer).not.toContain('](/haftpflicht')
  })
  it('gibt [] zurück, wenn keine Häufige-Fragen-Sektion existiert (z.B. SV-Spokes)', () => {
    expect(extractFaqPairs('# Titel\n\n## Worum es geht\n\nText.')).toEqual([])
  })
  it('parst auch CRLF-Bodies (Windows-Working-Tree) — Regression', () => {
    const pairs = extractFaqPairs(SAMPLE_FAQ.replace(/\n/g, '\r\n'))
    expect(pairs).toHaveLength(2)
    expect(pairs[0].question).toBe('Gilt auf dem Parkplatz rechts vor links?')
  })
})
