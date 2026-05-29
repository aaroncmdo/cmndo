import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { Button } from '../Button'

describe('Button', () => {
  it('rendert Link mit href, Navy-Hintergrund und Outlook-VML', async () => {
    const html = await render(<Button href="https://app.claimondo.de/kunde">Zum Portal</Button>)
    expect(html).toContain('https://app.claimondo.de/kunde')
    expect(html).toContain('Zum Portal')
    expect(html).toContain('#0D1B3E')
    expect(html).toContain('v:roundrect') // VML-Fallback für Outlook
  })
})
