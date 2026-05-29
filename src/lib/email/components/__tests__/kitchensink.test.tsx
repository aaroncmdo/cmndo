import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import {
  EmailShell, Hero, VehicleCard, StatGrid, StatusPill, BeraterCard, Timeline,
  Button, Callout, Note, Trustbar, Footer,
} from '../index'

describe('kitchensink', () => {
  it('rendert eine komplette Beispiel-Mail ohne Fehler', async () => {
    const html = await render(
      <EmailShell preview="Test" backgroundUrl="https://x/bg.jpg">
        <Hero logoUrl={null} headline="Willkommen, Max." subline="0 €">
          <VehicleCard imageUrl="https://x/car.png" label="Ihr Fahrzeug" value="BMW 320d" />
        </Hero>
        <StatusPill>In Bearbeitung</StatusPill>
        <StatGrid items={[{ label: 'Fallnummer', value: 'CLM-1' }, { label: 'Versicherung', value: null }]} />
        <Timeline steps={['Gutachten', 'Anwalt', 'Auszahlung']} currentIndex={0} />
        <BeraterCard name="Jonas Berger" photoUrl={null} contact="WhatsApp" />
        <Callout>Hinweis</Callout>
        <Button href="https://app.claimondo.de/kunde">Zum Portal</Button>
        <Trustbar items={['0 €', '§249 BGB']} />
        <Note>Fußnote</Note>
        <Footer />
      </EmailShell>,
    )
    expect(html).toContain('Willkommen, Max.')
    expect(html).toContain('Zum Portal')
    expect(html).not.toContain('Versicherung') // null-Wert wird ausgelassen (datengetrieben)
  })
})
