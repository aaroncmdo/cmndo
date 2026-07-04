import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { MaklerWochenReportEmail, subject } from '../MaklerWochenReport'

const BASE = {
  vorname: 'Max',
  firma: 'Muster Makler GmbH',
  zeitraumLabel: '24.06.2026 – 01.07.2026',
  neueLeads: 4,
  neueVermittlungen: 2,
  neueVermittlungenSummeLabel: '300,00 EUR',
  offeneLeads: 5,
  freigegebenAnzahl: 3,
  freigegebenSummeLabel: '450,00 EUR',
  staffel: { settledCount: 3, nochBis: 2, bonusLabel: '100,00 EUR', alleErreicht: false },
}

describe('MaklerWochenReportEmail', () => {
  it('rendert den Digest mit allen Kennzahlen + CTA', async () => {
    const html = await render(MaklerWochenReportEmail(BASE))
    expect(html).toContain('Muster Makler GmbH')
    expect(html).toContain('Wochen-Überblick')
    expect(html).toContain('Neue Leads')
    expect(html).toContain('Neue Vermittlungen')
    expect(html).toContain('Leads in Bearbeitung')
    expect(html).toContain('Freigegeben (abrechenbar)')
    expect(html).toContain('450,00 EUR')
    expect(html).toContain('300,00 EUR')
    expect(html).toContain('Zum Dashboard')
    expect(html).toContain('Einstellungen') // Opt-out-Hinweis
  })

  it('zeigt die Staffel-Sektion wenn Stufen konfiguriert sind', async () => {
    const html = await render(MaklerWochenReportEmail(BASE))
    expect(html).toContain('Staffel-Fortschritt')
    expect(html).toContain('100,00 EUR') // Bonus der naechsten Stufe
  })

  it('blendet die Staffel-Sektion aus wenn keine Stufen konfiguriert sind', async () => {
    const html = await render(MaklerWochenReportEmail({ ...BASE, staffel: null }))
    expect(html).not.toContain('Staffel-Fortschritt')
  })

  it('feiert erreichte Staffel-Stufen', async () => {
    const html = await render(
      MaklerWochenReportEmail({ ...BASE, staffel: { settledCount: 10, nochBis: null, bonusLabel: null, alleErreicht: true } }),
    )
    expect(html).toContain('alle Staffel-Stufen erreicht')
  })

  it('subject enthaelt die Firma', () => {
    expect(subject(BASE)).toContain('Muster Makler GmbH')
  })
})
