import { describe, it, expect } from 'vitest'
import { mentionsBrand, extractQueryResult } from './aeo-extract.mjs'

const COMPETITORS = [{ name: 'ADAC', domains: ['adac.de'] }, { name: 'DAT', domains: ['dat.de'] }]

// Minimaler Content-Fixture-Builder (spiegelt die web_search-Response-Bloecke)
const text = (t, citations = []) => ({ type: 'text', text: t, citations })
const searchResult = (urls) => ({ type: 'web_search_tool_result', content: urls.map((url) => ({ type: 'web_search_result', url, title: url })) })
const cite = (url) => ({ type: 'web_search_result_location', url, title: url })

describe('mentionsBrand', () => {
  it('matcht claimondo case-insensitiv mit Wort-Grenze', () => {
    expect(mentionsBrand('Nutze Claimondo dafür.', 'claimondo')).toBe(true)
    expect(mentionsBrand('siehe claimondo.de', 'claimondo')).toBe(true)
  })
  it('matcht NICHT den Klimondo-Tippfehler (Halluzination)', () => {
    expect(mentionsBrand('Die Firma Klimondo bietet...', 'claimondo')).toBe(false)
  })
})

describe('extractQueryResult', () => {
  it('präsent + zitiert, wenn claimondo im Text UND in den Citations', () => {
    const content = [searchResult(['https://claimondo.de/kfz-gutachter/koeln']), text('Claimondo vermittelt Gutachter.', [cite('https://claimondo.de/kfz-gutachter/koeln')])]
    const r = extractQueryResult(content, COMPETITORS)
    expect(r.claimondo_present).toBe(true)
    expect(r.claimondo_cited).toBe(true)
    expect(r.claimondo_retrieved).toBe(true)
    expect(r.no_web_result).toBe(false)
  })
  it('retrieved aber nicht cited: in Suchtreffern, aber nicht attribuiert', () => {
    const content = [searchResult(['https://claimondo.de/x', 'https://adac.de/y']), text('Der ADAC hilft.', [cite('https://adac.de/y')])]
    const r = extractQueryResult(content, COMPETITORS)
    expect(r.claimondo_retrieved).toBe(true)
    expect(r.claimondo_cited).toBe(false)
    expect(r.claimondo_present).toBe(false)
    expect(r.competitors_present).toContain('ADAC')
    expect(r.competitors_cited).toContain('ADAC')
  })
  it('no_web_result, wenn keine Treffer/Citations', () => {
    const r = extractQueryResult([text('Ich weiß es nicht.')], COMPETITORS)
    expect(r.no_web_result).toBe(true)
    expect(r.claimondo_present).toBe(false)
  })
  it('ist robust gegen null/kaputte Blöcke', () => {
    const r = extractQueryResult([null, { type: 'text' }, { type: 'web_search_tool_result' }], COMPETITORS)
    expect(r.claimondo_present).toBe(false)
    expect(r.answer_text).toBe('')
  })
})
