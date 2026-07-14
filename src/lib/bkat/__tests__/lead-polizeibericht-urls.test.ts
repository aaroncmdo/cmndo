import { describe, it, expect } from 'vitest'
import { polizeiberichtUrlsFromLead } from '../lead-polizeibericht-urls'

describe('polizeiberichtUrlsFromLead', () => {
  it('gibt die vorhandene URL als einelementiges Array zurück', () => {
    expect(polizeiberichtUrlsFromLead({ polizeibericht_url: 'https://cdn/p.jpg' })).toEqual(['https://cdn/p.jpg'])
  })

  it('gibt [] zurück wenn null', () => {
    expect(polizeiberichtUrlsFromLead({ polizeibericht_url: null })).toEqual([])
  })

  it('gibt [] zurück wenn undefined/fehlend', () => {
    expect(polizeiberichtUrlsFromLead({})).toEqual([])
  })

  it('behandelt leere und whitespace-only URLs als abwesend', () => {
    expect(polizeiberichtUrlsFromLead({ polizeibericht_url: '' })).toEqual([])
    expect(polizeiberichtUrlsFromLead({ polizeibericht_url: '   ' })).toEqual([])
  })

  it('trimmt Rand-Whitespace einer echten URL', () => {
    expect(polizeiberichtUrlsFromLead({ polizeibericht_url: '  https://cdn/p.jpg  ' })).toEqual(['https://cdn/p.jpg'])
  })
})
