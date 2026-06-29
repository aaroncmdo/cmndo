// Tests fuer die Kunden-Benachrichtigung bei Reparatur-Werkstatt-Zuweisung.
// Sender sind injizierbar -> kein echter WhatsApp/Email-Versand.

import { describe, it, expect, vi } from 'vitest'
import {
  buildKundeVermittlungWhatsApp,
  buildKundeVermittlungEmailHtml,
  notifyKundeWerkstattVermittlung,
  type NotifyDeps,
} from '../notify-kunde-vermittlung'

describe('buildKundeVermittlungWhatsApp', () => {
  it('enthaelt Anrede mit Vorname, Werkstatt-Name, Adresse und Telefon', () => {
    const msg = buildKundeVermittlungWhatsApp({
      vorname: 'Lisa',
      werkstattName: 'Werkstatt Müller',
      adresse: 'Hauptstr. 1, 50667 Köln',
      telefon: '0221 123',
    })
    expect(msg).toContain('Hallo Lisa,')
    expect(msg).toContain('Werkstatt Müller')
    expect(msg).toContain('Hauptstr. 1, 50667 Köln')
    expect(msg).toContain('Tel.: 0221 123')
    expect(msg).toContain('Claimondo-Team')
  })

  it('faellt ohne Vorname auf neutrale Anrede zurueck und laesst leere Felder weg', () => {
    const msg = buildKundeVermittlungWhatsApp({
      vorname: null,
      werkstattName: 'WS',
      adresse: null,
      telefon: null,
    })
    expect(msg).toContain('Hallo,')
    expect(msg).not.toContain('Tel.:')
  })
})

describe('buildKundeVermittlungEmailHtml', () => {
  it('escaped extern befuellte Werte (Stored-XSS-Schutz)', () => {
    const html = buildKundeVermittlungEmailHtml({
      vorname: '<b>x</b>',
      werkstattName: 'A & B "Auto" <script>',
      adresse: 'Weg <1>',
      telefon: '030',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B &quot;Auto&quot;')
    expect(html).toContain('Weg &lt;1&gt;')
    expect(html).toContain('Hallo &lt;b&gt;x&lt;/b&gt;,')
  })

  it('enthaelt Werkstatt-Name/Adresse/Telefon und neutrale Anrede ohne Vorname', () => {
    const html = buildKundeVermittlungEmailHtml({
      vorname: null,
      werkstattName: 'WS Köln',
      adresse: 'Ring 2',
      telefon: '0221',
    })
    expect(html).toContain('WS Köln')
    expect(html).toContain('Ring 2')
    expect(html).toContain('Tel.: 0221')
    expect(html).toContain('Hallo,')
  })
})

describe('notifyKundeWerkstattVermittlung', () => {
  function deps(over?: Partial<NotifyDeps>) {
    const wa = vi.fn().mockResolvedValue({ success: true, sid: 'x' })
    const mail = vi.fn().mockResolvedValue({ messageId: 'm' })
    const d = { sendWhatsApp: over?.sendWhatsApp ?? wa, sendEmail: over?.sendEmail ?? mail } as unknown as NotifyDeps
    return { d, wa, mail }
  }

  it('sendet WhatsApp und Email wenn beide Kontakte vorhanden', async () => {
    const { d, wa, mail } = deps()
    const res = await notifyKundeWerkstattVermittlung(
      {
        kunde: { vorname: 'Lisa', telefon: '0221 1', email: 'l@example.com' },
        werkstatt: { name: 'WS', adresse: 'Ring 2', telefon: '030' },
        fallId: null,
      },
      d,
    )
    expect(wa).toHaveBeenCalledTimes(1)
    expect(wa.mock.calls[0][0]).toBe('0221 1')
    expect(wa.mock.calls[0][1]).toContain('WS')
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][0].to).toBe('l@example.com')
    expect(mail.mock.calls[0][0].subject).toContain('Reparatur-Werkstatt')
    expect(mail.mock.calls[0][0].empfaengerTyp).toBe('kunde')
    expect(res).toEqual({ whatsapp: true, email: true })
  })

  it('ueberspringt WhatsApp ohne Telefon und Email ohne Email-Adresse', async () => {
    const { d, wa, mail } = deps()
    const res = await notifyKundeWerkstattVermittlung(
      { kunde: { vorname: 'Lisa', telefon: null, email: null }, werkstatt: { name: 'WS' } },
      d,
    )
    expect(wa).not.toHaveBeenCalled()
    expect(mail).not.toHaveBeenCalled()
    expect(res).toEqual({ whatsapp: false, email: false })
  })

  it('ist non-fatal: WhatsApp-Fehler wirft nicht und blockt Email nicht', async () => {
    const wa = vi.fn().mockRejectedValue(new Error('boom'))
    const { d, mail } = deps({ sendWhatsApp: wa as unknown as NotifyDeps['sendWhatsApp'] })
    const res = await notifyKundeWerkstattVermittlung(
      { kunde: { telefon: '0221', email: 'l@example.com' }, werkstatt: { name: 'WS' } },
      d,
    )
    expect(mail).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ whatsapp: false, email: true })
  })

  it('meldet whatsapp:false wenn sendWhatsApp success:false zurueckgibt', async () => {
    const wa = vi.fn().mockResolvedValue({ success: false, error: 'no number' })
    const { d } = deps({ sendWhatsApp: wa as unknown as NotifyDeps['sendWhatsApp'] })
    const res = await notifyKundeWerkstattVermittlung(
      { kunde: { telefon: '0221' }, werkstatt: { name: 'WS' } },
      d,
    )
    expect(res.whatsapp).toBe(false)
  })
})
