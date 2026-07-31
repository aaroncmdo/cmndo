import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildB2BSystemPrompt, parseDraft } from './generate'

describe('buildSystemPrompt', () => {
  it('enthaelt die Legal-Guardrails', () => {
    const p = buildSystemPrompt()
    expect(p).toMatch(/RDG|Handlungsempfehlung/)
    expect(p).toMatch(/BGH/)
    expect(p).toMatch(/absolut sicher|erfundenes/)
    expect(p).toMatch(/keine Rechtsberatung/)
  })
})

describe('parseDraft (2-Teile-Format: Metadaten-JSON + ===BODY=== + Markdown)', () => {
  it('akzeptiert vollstaendigen Draft', () => {
    const meta = JSON.stringify({
      slug: 'x-y',
      title: 'T',
      excerpt: 'e'.repeat(120),
      keyFacts: ['a', 'b', 'c'],
      metaDescription: 'm',
      primaryKeyword: 'k',
      cluster: 'H3',
    })
    const raw = meta + '\n===BODY===\n# T\n\n> **Kurz erklaert:** ' + 'Fliesstext. '.repeat(20)
    expect(parseDraft(raw).ok).toBe(true)
  })

  it('lehnt fehlenden BODY-Marker ab (kein throw)', () => {
    expect(parseDraft('{"title":"T"}').ok).toBe(false)
    expect(parseDraft('nicht json').ok).toBe(false)
  })

  it('lehnt kaputtes Metadaten-JSON ab (kein throw)', () => {
    expect(parseDraft('kaputt ===BODY=== ' + 'x'.repeat(150)).ok).toBe(false)
  })

  it('akzeptiert einen Body mit ungeschuetzten Anfuehrungszeichen (Kern-Fix)', () => {
    const meta = JSON.stringify({
      slug: 'a-b', title: 'T', excerpt: 'e'.repeat(120), keyFacts: ['a'],
      metaDescription: 'm', primaryKeyword: 'k', cluster: 'H3',
    })
    const body = '# Titel\n\nDer "Restwert" ist entscheidend — Zitat: "so das Gericht".\n' + 'Mehr Text. '.repeat(20)
    expect(parseDraft(meta + '\n===BODY===\n' + body).ok).toBe(true)
  })

  it('parsiert tags-Feld aus Metadaten-JSON (B2B)', () => {
    const meta = JSON.stringify({
      slug: 'recht-urteil-test',
      title: 'T',
      excerpt: 'e'.repeat(120),
      keyFacts: ['a'],
      metaDescription: 'm',
      primaryKeyword: 'k',
      cluster: 'H3',
      tags: ['Recht & Urteile'],
    })
    const body = '# Titel\n\n' + 'Fliesstext. '.repeat(20)
    const result = parseDraft(meta + '\n===BODY===\n' + body)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.tags).toEqual(['Recht & Urteile'])
    }
  })

  it('setzt tags=[] wenn Feld fehlt (consumer-Pfad)', () => {
    const meta = JSON.stringify({
      slug: 'consumer-test',
      title: 'T',
      excerpt: 'e'.repeat(120),
      keyFacts: ['a'],
      metaDescription: 'm',
      primaryKeyword: 'k',
      cluster: 'H3',
    })
    const body = '# Titel\n\n' + 'Fliesstext. '.repeat(20)
    const result = parseDraft(meta + '\n===BODY===\n' + body)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.tags).toEqual([])
    }
  })
})

describe('buildB2BSystemPrompt', () => {
  it('enthaelt Sachverstaendige, Tag-Liste und Quelle-Hinweis', () => {
    const p = buildB2BSystemPrompt()
    expect(p).toContain('Sachverständige')
    expect(p).toContain('Recht & Urteile')
    expect(p).toContain('Quelle:')
  })

  it('enthaelt Legal-Safeguards wie buildSystemPrompt', () => {
    const p = buildB2BSystemPrompt()
    expect(p).toMatch(/RDG|Handlungsempfehlung/)
    expect(p).toMatch(/BGH/)
    expect(p).toMatch(/absolut sicher|erfundenes/)
    expect(p).toMatch(/keine Rechtsberatung/)
  })
})
