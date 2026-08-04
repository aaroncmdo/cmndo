import { describe, it, expect } from 'vitest'
import { webApplicationSchema, SITE_URL } from './jsonld'

describe('webApplicationSchema', () => {
  it('erzeugt einen validen WebApplication-Knoten (FinanceApplication, 0 EUR)', () => {
    const s = webApplicationSchema({
      name: 'Wertminderungs-Rechner',
      description: 'Interaktiver merkantiler Wertminderungs-Rechner.',
      url: `${SITE_URL}/kfz-gutachter/wertminderung`,
    })
    expect(s['@type']).toBe('WebApplication')
    expect(s.applicationCategory).toBe('FinanceApplication')
    expect(s.offers).toMatchObject({ price: '0', priceCurrency: 'EUR' })
    expect(s['@context']).toBe('https://schema.org')
  })
})
