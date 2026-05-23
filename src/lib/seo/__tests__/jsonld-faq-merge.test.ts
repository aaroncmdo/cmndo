import { describe, it, expect } from 'vitest'
import { mergeFaqStemsIntoSchema } from '../jsonld'

const STEMS = [
  { question: 'Frage A?', answer: 'Antwort A.' },
  { question: 'Frage B?', answer: 'Antwort B.' },
]

describe('mergeFaqStemsIntoSchema', () => {
  it('hängt Stems an eine bestehende FAQPage im @graph an (eine FAQPage)', () => {
    const input = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Article', headline: 'X' },
        { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Bestehende?', acceptedAnswer: { '@type': 'Answer', text: 'Y' } }] },
      ],
    })
    const out = JSON.parse(mergeFaqStemsIntoSchema(input, STEMS))
    const faqs = out['@graph'].filter((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faqs).toHaveLength(1) // KEINE 2. FAQPage
    expect(faqs[0].mainEntity).toHaveLength(3) // 1 bestehend + 2 Stems
    expect(faqs[0].mainEntity.map((q: { name: string }) => q.name)).toContain('Frage A?')
  })

  it('dedupliziert Stems gegen bestehende Fragen (per name)', () => {
    const input = JSON.stringify({ '@graph': [{ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Frage A?', acceptedAnswer: { '@type': 'Answer', text: 'alt' } }] }] })
    const out = JSON.parse(mergeFaqStemsIntoSchema(input, STEMS))
    const faq = out['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faq.mainEntity).toHaveLength(2) // Frage A? nicht doppelt + Frage B?
  })

  it('ergänzt eine FAQPage, wenn keine vorhanden ist', () => {
    const input = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Article', headline: 'X' }] })
    const out = JSON.parse(mergeFaqStemsIntoSchema(input, STEMS))
    const faqs = out['@graph'].filter((n: { '@type': string }) => n['@type'] === 'FAQPage')
    expect(faqs).toHaveLength(1)
    expect(faqs[0].mainEntity).toHaveLength(2)
  })

  it('lässt das Schema bei ungültigem JSON unverändert (nie Bruch)', () => {
    const bad = '{ kaputt'
    expect(mergeFaqStemsIntoSchema(bad, STEMS)).toBe(bad)
  })

  it('gibt das Schema bei leeren Stems unverändert zurück', () => {
    const input = '{"@type":"Article"}'
    expect(mergeFaqStemsIntoSchema(input, [])).toBe(input)
  })
})
