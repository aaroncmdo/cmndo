import { describe, it, expect } from 'vitest'
import { renderColdMailHtml } from '../render-shell'

describe('renderColdMailHtml', () => {
  it('injiziert den Body und rendert Abmeldelink + Footer', async () => {
    const html = await renderColdMailHtml({ bodyHtml: '<p>MEIN_BODY_MARKER</p>', abmeldeUrl: 'https://app.claimondo.de/abmelden/TOK123' })
    expect(html).toContain('MEIN_BODY_MARKER')
    expect(html).toContain('https://app.claimondo.de/abmelden/TOK123')
    expect(html).toContain('Abmelden')
    expect(html).toContain('Claimondo')
  })
})
