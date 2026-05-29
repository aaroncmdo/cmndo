import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { BeraterCard } from '../BeraterCard'
import { Timeline } from '../Timeline'

describe('BeraterCard + Timeline', () => {
  it('rendert Berater mit Kontakt', async () => {
    const html = await render(<BeraterCard name="Jonas Berger" photoUrl="https://x/b.png" contact="WhatsApp · 0221" />)
    expect(html).toContain('Jonas Berger')
    expect(html).toContain('WhatsApp · 0221')
    expect(html).toContain('Ansprechpartner')
  })
  it('markiert den aktuellen Schritt', async () => {
    const html = await render(<Timeline steps={['Gutachten', 'Anwalt', 'Auszahlung']} currentIndex={1} />)
    expect(html).toContain('Gutachten')
    expect(html).toContain('Auszahlung')
    expect(html).toContain('#4573A2') // aktiver Schritt in ondo
  })
})
