import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  mapResendEvent,
  sollStatusUebernehmen,
  verifyResendSignatur,
  type ColdMailSendStatus,
} from '../webhook'

describe('mapResendEvent', () => {
  it('bildet die Resend-Events auf unser CHECK-Vokabular ab', () => {
    expect(mapResendEvent('email.sent')).toBe('gesendet')
    expect(mapResendEvent('email.delivered')).toBe('zugestellt')
    expect(mapResendEvent('email.opened')).toBe('geoeffnet')
    expect(mapResendEvent('email.clicked')).toBe('geklickt')
    expect(mapResendEvent('email.bounced')).toBe('bounced')
    expect(mapResendEvent('email.complained')).toBe('beschwerde')
  })

  it('ignoriert unbekannte/irrelevante Events (kein Crash, kein Write)', () => {
    expect(mapResendEvent('email.delivery_delayed')).toBeNull()
    expect(mapResendEvent('contact.created')).toBeNull()
    expect(mapResendEvent('')).toBeNull()
  })
})

describe('sollStatusUebernehmen', () => {
  it('aktualisiert nur AUFWAERTS (Webhooks kommen out-of-order)', () => {
    expect(sollStatusUebernehmen('gesendet', 'zugestellt')).toBe(true)
    expect(sollStatusUebernehmen('zugestellt', 'geoeffnet')).toBe(true)
    expect(sollStatusUebernehmen('geoeffnet', 'geklickt')).toBe(true)
  })

  it('degradiert NIE — ein spaetes "zugestellt" darf "geoeffnet" nicht ueberschreiben', () => {
    expect(sollStatusUebernehmen('geoeffnet', 'zugestellt')).toBe(false)
    expect(sollStatusUebernehmen('geklickt', 'geoeffnet')).toBe(false)
  })

  it('ist idempotent — derselbe Event nochmal (Svix retried) aendert nichts', () => {
    expect(sollStatusUebernehmen('geoeffnet', 'geoeffnet')).toBe(false)
  })

  it('bounce/beschwerde gewinnen — sie loesen die Suppression aus und duerfen nicht verlorengehen', () => {
    expect(sollStatusUebernehmen('geoeffnet', 'bounced')).toBe(true)
    expect(sollStatusUebernehmen('bounced', 'beschwerde')).toBe(true)
    expect(sollStatusUebernehmen('beschwerde', 'zugestellt')).toBe(false)
  })

  it('unbekannter Ist-Status blockiert das Update nicht', () => {
    expect(sollStatusUebernehmen('quatsch', 'geoeffnet')).toBe(true)
  })
})

// ─── Svix-Signatur (Resend nutzt Svix; die Lib ist KEINE Dependency) ────────
const SECRET = 'whsec_' + Buffer.from('supergeheim-webhook-key').toString('base64')

function signiere(id: string, ts: string, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return `v1,${sig}`
}

describe('verifyResendSignatur', () => {
  const body = '{"type":"email.opened","data":{"email_id":"msg_1"}}'
  const id = 'msg_abc'
  const jetzt = new Date('2026-07-14T12:00:00Z')
  const ts = String(Math.floor(jetzt.getTime() / 1000))

  it('akzeptiert eine korrekte Signatur', () => {
    expect(
      verifyResendSignatur({
        secret: SECRET, svixId: id, svixTimestamp: ts, body,
        signaturHeader: signiere(id, ts, body), jetzt,
      }),
    ).toBe(true)
  })

  it('akzeptiert auch, wenn der Header MEHRERE Signaturen traegt (Key-Rotation)', () => {
    expect(
      verifyResendSignatur({
        secret: SECRET, svixId: id, svixTimestamp: ts, body,
        signaturHeader: `v1,falsch ${signiere(id, ts, body)}`, jetzt,
      }),
    ).toBe(true)
  })

  it('lehnt eine manipulierte Payload ab', () => {
    expect(
      verifyResendSignatur({
        secret: SECRET, svixId: id, svixTimestamp: ts,
        body: '{"type":"email.opened","data":{"email_id":"FREMD"}}',
        signaturHeader: signiere(id, ts, body), jetzt,
      }),
    ).toBe(false)
  })

  it('lehnt eine Signatur mit falschem Secret ab', () => {
    const fremd = 'whsec_' + Buffer.from('anderer-key').toString('base64')
    expect(
      verifyResendSignatur({
        secret: SECRET, svixId: id, svixTimestamp: ts, body,
        signaturHeader: signiere(id, ts, body, fremd), jetzt,
      }),
    ).toBe(false)
  })

  it('lehnt einen alten Timestamp ab (Replay-Schutz)', () => {
    const altTs = String(Math.floor(jetzt.getTime() / 1000) - 3600) // 1h alt
    expect(
      verifyResendSignatur({
        secret: SECRET, svixId: id, svixTimestamp: altTs, body,
        signaturHeader: signiere(id, altTs, body), jetzt,
      }),
    ).toBe(false)
  })

  it('lehnt fehlende Header ab', () => {
    expect(
      verifyResendSignatur({ secret: SECRET, svixId: '', svixTimestamp: '', body, signaturHeader: '', jetzt }),
    ).toBe(false)
  })
})
