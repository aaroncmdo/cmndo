import { describe, it, expect } from 'vitest'
import { buildKundeReparaturterminEmailHtml } from '../notify-kunde-reparaturtermin'

describe('buildKundeReparaturterminEmailHtml — werkstatt_vorschlag', () => {
  it('nennt den vorgeschlagenen Termin und fordert zur Bestätigung auf', () => {
    const { html, betreff } = buildKundeReparaturterminEmailHtml({
      vorname: 'Max',
      ereignis: 'werkstatt_vorschlag',
      bestaetigterTermin: '2026-07-15T09:00:00Z',
    })
    expect(betreff).toContain('vorgeschlagen')
    expect(html).toContain('bestätigen')
  })
})
