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
})
