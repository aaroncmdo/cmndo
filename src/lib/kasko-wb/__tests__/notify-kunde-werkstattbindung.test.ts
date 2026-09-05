// src/lib/kasko-wb/__tests__/notify-kunde-werkstattbindung.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildWerkstattbindungEmailHtml, notifyKundeWerkstattbindung } from '../notify-kunde-werkstattbindung'
import type { KaskoBindungsInfo } from '../types'

const info: KaskoBindungsInfo = {
  markeName: 'HUK-COBURG', tarifName: 'Classic SELECT', wbMarker: ['SELECT'], nachlassText: 'bis 20 %',
  sanktionText: 'Kürzung auf 85 % <script>', ausnahmenText: 'Totalschaden', partnernetz: 'Die Partnerwerkstatt',
  verlaesslichkeit: 'belegt', bindungsumfang: 'voll', hotline: '09561 96 0', schadenEmail: 'schaden@huk.de', webseite: null, stand: '2026-07-20',
}

describe('buildWerkstattbindungEmailHtml', () => {
  it('enthaelt Marke, Tarif, Sanktion, Hotline und escaped HTML', () => {
    const html = buildWerkstattbindungEmailHtml({ vorname: 'Anna <b>', info })
    expect(html).toContain('Hallo Anna &lt;b&gt;,')
    expect(html).toContain('HUK-COBURG')
    expect(html).toContain('Classic SELECT')
    expect(html).toContain('Kürzung auf 85 % &lt;script&gt;')
    expect(html).toContain('09561 96 0')
    expect(html).toContain('schaden@huk.de')
    expect(html).not.toContain('<script>')
  })
})

describe('notifyKundeWerkstattbindung', () => {
  it('sendet nur mit E-Mail, non-fatal bei Fehler', async () => {
    const sendEmail = vi.fn(async () => ({ messageId: 'test' }))
    const r1 = await notifyKundeWerkstattbindung({ kunde: { vorname: 'Anna', email: 'a@b.de' }, info }, { sendEmail })
    expect(r1.email).toBe(true)
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.de', template: 'kasko_werkstattbindung_kunde', empfaengerTyp: 'kunde' }))
    const r2 = await notifyKundeWerkstattbindung({ kunde: { vorname: null, email: null }, info }, { sendEmail })
    expect(r2.email).toBe(false)
    const boom = vi.fn(async (): Promise<{ messageId: string }> => { throw new Error('smtp') })
    const r3 = await notifyKundeWerkstattbindung({ kunde: { vorname: null, email: 'x@y.de' }, info }, { sendEmail: boom })
    expect(r3.email).toBe(false)
  })
})
