import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { EmailShell, Paragraph } from '../Layout'
import { MailHeader } from '../MailHeader'
import { Card } from '../Card'
import { Footer } from '../Blocks'
import { Hero } from '../Hero'
import { BeraterCard } from '../BeraterCard'

// Dark-Mode "Marke schuetzen": destruktive Auto-Inversion verhindern, Brand-Farben
// pinnen. Apple Mail via @media (prefers-color-scheme), Outlook via [data-ogsc]/[data-ogsb].

describe('Dark-Mode "Marke schuetzen"', () => {
  it('EmailShell <style> enthaelt @media + Outlook-Overrides + Brand-Pins', async () => {
    const html = await render(
      <EmailShell preview="Vorschau">
        <MailHeader />
        <Card><Paragraph>Inhalt</Paragraph></Card>
        <Footer />
      </EmailShell>,
    )
    // Color-scheme-Metas bleiben
    expect(html).toContain('color-scheme')
    expect(html).toContain('supported-color-schemes')
    // Apple-Pfad
    expect(html).toContain('@media (prefers-color-scheme: dark)')
    // Outlook-Pfad
    expect(html).toContain('[data-ogsc]')
    expect(html).toContain('[data-ogsb]')
    // Selektoren
    for (const sel of ['.cl-bg-light', '.cl-surface', '.cl-cream', '.cl-wordmark', '.cl-footer']) {
      expect(html).toContain(sel)
    }
    // Brand-Pins (navy Backdrop, footerOnDark)
    expect(html).toContain('#0D1B3E')
    expect(html).toContain('#8aa0bd')
    // !important muss vorhanden sein, sonst schlaegt es die Inline-Styles nicht
    expect(html).toContain('!important')
  })

  it('wired die Class-Hooks an die richtigen Elemente', async () => {
    const html = await render(
      <EmailShell preview="Vorschau">
        <MailHeader />
        <Card><Paragraph>Inhalt</Paragraph></Card>
        <Footer />
      </EmailShell>,
    )
    expect(html).toMatch(/class="[^"]*\bcl-bg-light\b/)  // Backdrop-Wrapper (Tier-2/3)
    expect(html).toMatch(/class="[^"]*\bcl-surface\b/)   // Card
    expect(html).toMatch(/class="[^"]*\bcl-wordmark\b/)  // MailHeader-Wortmarke
    expect(html).toMatch(/class="[^"]*\bcl-footer\b/)    // Footer
  })

  it('Tier-1: Hero-Chip (weiss) + BeraterCard (cream) tragen die Pin-Hooks', async () => {
    const html = await render(
      <EmailShell preview="Vorschau" dark>
        <Hero logoUrl={null} headline="Willkommen" />
        <Card>
          <BeraterCard name="Jonas Berger" photoUrl={null} contact="WhatsApp" />
        </Card>
        <Footer onDark />
      </EmailShell>,
    )
    expect(html).toMatch(/class="[^"]*\bcl-bg-dark\b/) // Backdrop-Wrapper (Tier-1 navy)
    expect(html).toMatch(/class="[^"]*\bcl-surface\b/) // Hero-Logo-Chip
    expect(html).toMatch(/class="[^"]*\bcl-cream\b/)   // BeraterCard
  })
})
