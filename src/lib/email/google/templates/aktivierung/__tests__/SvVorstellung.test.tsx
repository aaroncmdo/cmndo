import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { SvVorstellungEmail } from '../SvVorstellung'

describe('SvVorstellungEmail', () => {
  it('rendert SV-Namen + Region aus merge.sv', async () => {
    const html = await render(SvVorstellungEmail({
      copy: { headline: 'Dein Gutachter in [Region]', absaetze: ['a1'], cta_label: 'Ersten Fall anlegen' },
      merge: {
        werkstattName: 'W', ansprechpartner: 'Nicolas', tel: '+49', portalLink: 'https://x',
        sv: { name: 'Kelvin Gall', region: 'Köln', contact: '+49 221' },
      },
    }))
    expect(html).toContain('Kelvin Gall')
    expect(html).toContain('Köln')
  })

  it('substituiert BEIDE Platzhalter in Headline UND Absaetzen — keine rohen [...] (C1-Regression)', async () => {
    // exakt die Seed-Copy-Struktur (beide Platzhalter in Headline + jedem Absatz)
    const html = await render(SvVorstellungEmail({
      copy: {
        headline: 'Dein Gutachter in [Region]: [Gutachter-Name]',
        absaetze: [
          'viele Werkstätten fragen sich zu Recht, wer ihre Schäden begutachtet. Deshalb stelle ich dir kurz [Gutachter-Name] vor.',
          '[Gutachter-Name] ist unser Sachverständiger für [Region] – vor Ort, direkt erreichbar.',
        ],
        cta_label: 'Ersten Fall anlegen',
      },
      merge: {
        werkstattName: 'W', ansprechpartner: 'Nicolas', tel: '+49', portalLink: 'https://x',
        sv: { name: 'Kelvin', region: 'Köln' },
      },
    }))
    expect(html).toContain('Dein Gutachter in Köln: Kelvin')
    expect(html).toContain('Kelvin ist unser Sachverständiger für Köln')
    // KEIN roher Platzhalter darf im gerenderten HTML zurueckbleiben:
    expect(html).not.toContain('[Region]')
    expect(html).not.toContain('[Gutachter-Name]')
  })
})
