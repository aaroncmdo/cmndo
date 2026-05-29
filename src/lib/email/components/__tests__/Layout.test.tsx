import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { EmailShell, Heading, Paragraph } from '../Layout'

describe('EmailShell', () => {
  it('rendert Preheader, Navy-Fallback und Dark-Mode-Meta', async () => {
    const html = await render(
      <EmailShell preview="Vorschautext" backgroundUrl="https://x/y.jpg">
        <Heading>Titel</Heading>
        <Paragraph>Text</Paragraph>
      </EmailShell>,
    )
    expect(html).toContain('Vorschautext')
    expect(html).toContain('#0D1B3E') // Navy-Fallback
    expect(html).toContain('color-scheme')
    expect(html).toContain('Titel')
  })
})
