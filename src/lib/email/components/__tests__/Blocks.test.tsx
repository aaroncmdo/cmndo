import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Callout, Note, Trustbar, InfoRow, Footer } from '../Blocks'

describe('Blocks', () => {
  it('rendert alle kleinen Bausteine', async () => {
    const html = await render(
      <>
        <Callout>Wichtiger Hinweis</Callout>
        <Note>Kleingedrucktes</Note>
        <Trustbar items={['0 € bei Fremdverschulden', '§249 BGB']} />
        <InfoRow label="Portal" value="app.claimondo.de" />
        <Footer />
      </>,
    )
    expect(html).toContain('Wichtiger Hinweis')
    expect(html).toContain('Kleingedrucktes')
    expect(html).toContain('§249 BGB')
    expect(html).toContain('app.claimondo.de')
    expect(html).toContain('Impressum')
    expect(html).toContain('Datenschutz')
  })
})
