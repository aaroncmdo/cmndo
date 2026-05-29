import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { MailHeader } from '../MailHeader'

describe('MailHeader', () => {
  it('rendert Wortmarke + Gold-Akzent (Default Claimondo)', async () => {
    const html = await render(<MailHeader />)
    expect(html).toContain('Claimondo')
    expect(html).toContain('#C9A84C') // Gold-Akzent
  })
  it('rendert Brand-Logo wenn logoUrl gesetzt', async () => {
    const html = await render(<MailHeader logoUrl="https://x/logo.png" logoText="Muster GmbH" />)
    expect(html).toContain('https://x/logo.png')
    expect(html).toContain('Muster GmbH') // alt-Text
  })
})
