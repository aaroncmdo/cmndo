import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { PartnerOnboardingEinladung } from '../PartnerOnboardingEinladung'

describe('PartnerOnboardingEinladung', () => {
  it('enthält Firmenname, Onboarding-Begriff und Video-Link bei online-Kanal', async () => {
    const html = await render(
      PartnerOnboardingEinladung({
        firma: 'Kfz Meier',
        ansprechpartner: 'Max Mustermann',
        zeitpunktText: '10. Juli 2026, 14:00',
        kanal: 'online',
        videoLink: 'https://meet.google.com/abc',
        treffpunktAdresse: null,
      }),
    )
    expect(html).toContain('Kfz Meier')
    expect(html).toContain('Onboarding')
    expect(html).toContain('meet.google.com/abc')
  })

  it('zeigt Adresse bei vor_ort-Kanal', async () => {
    const html = await render(
      PartnerOnboardingEinladung({
        firma: 'Autowerkstatt GmbH',
        ansprechpartner: null,
        zeitpunktText: '12. Juli 2026, 10:00',
        kanal: 'vor_ort',
        videoLink: null,
        treffpunktAdresse: 'Musterstraße 1, 80331 München',
      }),
    )
    expect(html).toContain('Musterstra')
    expect(html).toContain('Onboarding')
  })

  it('zeigt Hinweis auf Kalendereinladung', async () => {
    const html = await render(
      PartnerOnboardingEinladung({
        firma: null,
        ansprechpartner: null,
        zeitpunktText: '15. Juli 2026, 09:00',
        kanal: 'online',
        videoLink: null,
        treffpunktAdresse: null,
      }),
    )
    expect(html).toContain('.ics')
  })
})
