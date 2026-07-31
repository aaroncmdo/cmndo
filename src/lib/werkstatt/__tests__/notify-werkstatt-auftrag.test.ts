// Tests fuer den Workshop-Notify (Email) bei Reparatur-Werkstatt-Zuweisung.
// Sender injizierbar -> kein echter Email-Versand.

import { describe, it, expect, vi } from 'vitest'
import {
  buildWerkstattAuftragEmailHtml,
  notifyWerkstattNeuerAuftrag,
  type NotifyWerkstattDeps,
} from '../notify-werkstatt-auftrag'

describe('buildWerkstattAuftragEmailHtml', () => {
  it('enthaelt Werkstatt-Name + Kunde und escaped extern befuellte Werte', () => {
    const html = buildWerkstattAuftragEmailHtml({ werkstattName: 'A & B <Auto>', kundeName: '<b>Lisa</b>' })
    expect(html).toContain('A &amp; B &lt;Auto&gt;')
    expect(html).toContain('&lt;b&gt;Lisa&lt;/b&gt;')
    expect(html).not.toContain('<b>Lisa</b>')
    expect(html).toContain('Reparaturauftrag')
  })

  it('laesst die Kunde-Zeile weg wenn kein Name', () => {
    const html = buildWerkstattAuftragEmailHtml({ werkstattName: 'WS', kundeName: null })
    expect(html).toContain('Hallo WS,')
    expect(html).not.toContain('Kunde:')
  })

  it('verlinkt das Werkstatt-Portal wenn portalUrl gesetzt', () => {
    const html = buildWerkstattAuftragEmailHtml({
      werkstattName: 'WS',
      portalUrl: 'https://app.example.com/werkstatt/auftraege',
    })
    expect(html).toContain('href="https://app.example.com/werkstatt/auftraege"')
    expect(html).toContain('Werkstatt-Portal')
  })
})

describe('notifyWerkstattNeuerAuftrag', () => {
  function deps(over?: Partial<NotifyWerkstattDeps>) {
    const mail = vi.fn().mockResolvedValue({ messageId: 'm' })
    const d = { sendEmail: over?.sendEmail ?? mail } as unknown as NotifyWerkstattDeps
    return { d, mail }
  }

  it('sendet Email wenn Werkstatt-Email vorhanden', async () => {
    const { d, mail } = deps()
    const r = await notifyWerkstattNeuerAuftrag(
      { werkstatt: { email: 'ws@example.com', name: 'WS' }, kunde: { name: 'Lisa' }, fallId: null },
      d,
    )
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][0].to).toBe('ws@example.com')
    expect(mail.mock.calls[0][0].subject).toContain('Reparaturauftrag')
    // Send-Isolation muss umgangen werden, sonst erreicht die Mail keine internen
    // Test-Werkstatt-Konten (@claimondo.de) — s. notify-werkstatt-auftrag.ts.
    expect(mail.mock.calls[0][0].allowInternalRecipient).toBe(true)
    expect(r).toEqual({ email: true })
  })

  it('ueberspringt ohne Werkstatt-Email', async () => {
    const { d, mail } = deps()
    const r = await notifyWerkstattNeuerAuftrag({ werkstatt: { email: null, name: 'WS' } }, d)
    expect(mail).not.toHaveBeenCalled()
    expect(r).toEqual({ email: false })
  })

  it('ist non-fatal bei Email-Fehler', async () => {
    const mail = vi.fn().mockRejectedValue(new Error('boom'))
    const { d } = deps({ sendEmail: mail as unknown as NotifyWerkstattDeps['sendEmail'] })
    const r = await notifyWerkstattNeuerAuftrag({ werkstatt: { email: 'ws@example.com', name: 'WS' } }, d)
    expect(r).toEqual({ email: false })
  })
})
