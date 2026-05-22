import { describe, it, expect } from 'vitest'
import {
  normalizeMatelsoStatus,
  buildDedupKey,
  pickNotificationLink,
  buildCallNotificationText,
} from '../process-call'

describe('normalizeMatelsoStatus', () => {
  it('mappt answered/completed/connected -> answered', () => {
    expect(normalizeMatelsoStatus('answered')).toBe('answered')
    expect(normalizeMatelsoStatus('COMPLETED')).toBe('answered')
    expect(normalizeMatelsoStatus('connected')).toBe('answered')
  })
  it('mappt no-answer/noanswer/missed/cancel/reject -> missed', () => {
    expect(normalizeMatelsoStatus('no-answer')).toBe('missed')
    expect(normalizeMatelsoStatus('NOANSWER')).toBe('missed')
    expect(normalizeMatelsoStatus('missed')).toBe('missed')
    expect(normalizeMatelsoStatus('cancelled')).toBe('missed')
    expect(normalizeMatelsoStatus('rejected')).toBe('missed')
  })
  it('mappt voicemail/mailbox -> voicemail', () => {
    expect(normalizeMatelsoStatus('voicemail')).toBe('voicemail')
    expect(normalizeMatelsoStatus('mailbox')).toBe('voicemail')
  })
  it('mappt busy/failed -> failed', () => {
    expect(normalizeMatelsoStatus('busy')).toBe('failed')
    expect(normalizeMatelsoStatus('failed')).toBe('failed')
  })
  it('mappt unbekannt/leer -> other', () => {
    expect(normalizeMatelsoStatus('hangup-xyz')).toBe('other')
    expect(normalizeMatelsoStatus('')).toBe('other')
    expect(normalizeMatelsoStatus(undefined)).toBe('other')
  })
})

describe('buildDedupKey', () => {
  it('nutzt call_id wenn vorhanden', () => {
    expect(buildDedupKey({ callId: 'abc', from: '+49170', zeitpunkt: 't' })).toBe('matelso:abc')
  })
  it('faellt auf hash(from|zeitpunkt) zurueck wenn keine call_id', () => {
    const k1 = buildDedupKey({ from: '+49170', zeitpunkt: '2026-05-22T10:00:00Z' })
    const k2 = buildDedupKey({ from: '+49170', zeitpunkt: '2026-05-22T10:00:00Z' })
    expect(k1).toBe(k2)
    expect(k1.startsWith('matelso:fallback:')).toBe(true)
  })
  it('erzeugt einmaligen Schluessel wenn weder call_id noch from+zeitpunkt', () => {
    const k1 = buildDedupKey({})
    const k2 = buildDedupKey({})
    expect(k1).not.toBe(k2)
    expect(k1.startsWith('matelso:nokey:')).toBe(true)
  })
})

describe('pickNotificationLink', () => {
  it('Lead gewinnt vor Fall', () => {
    expect(pickNotificationLink('lead-1', 'fall-1')).toBe('/dispatch/leads/lead-1')
  })
  it('nur Fall -> Fall-Link', () => {
    expect(pickNotificationLink(null, 'fall-1')).toBe('/faelle/fall-1')
  })
  it('weder noch -> undefined', () => {
    expect(pickNotificationLink(null, null)).toBeUndefined()
  })
})

describe('buildCallNotificationText', () => {
  it('mit Nummer', () => {
    const r = buildCallNotificationText({ fromNumber: '+491701234567', quelle: 'Google Ads', status: 'answered', duration: 120 })
    expect(r.titel).toBe('Eingehender Anruf von +491701234567')
    expect(r.beschreibung).toBe('Google Ads · Status: answered · Dauer: 120s')
  })
  it('ohne Nummer (unterdrueckt)', () => {
    const r = buildCallNotificationText({ fromNumber: '', quelle: null, status: 'other', duration: null })
    expect(r.titel).toBe('Eingehender Anruf mit unterdrückter Nummer')
    expect(r.beschreibung).toBe('Quelle unbekannt · Status: other · Dauer: 0s')
  })
})
