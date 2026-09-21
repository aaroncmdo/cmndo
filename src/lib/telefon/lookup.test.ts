import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 'server-only' wirft in der vitest-Node-Umgebung schon beim Import (Intake-Funnel-Falle).
vi.mock('server-only', () => ({}))

import { pruefeTelefonTyp, kannKurznachrichtEmpfangen } from './lookup'

const ECHT_FETCH = global.fetch

function antwort(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response)
}

beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = 'AC-test'
  process.env.TWILIO_AUTH_TOKEN = 'token-test'
})
afterEach(() => {
  global.fetch = ECHT_FETCH
  vi.restoreAllMocks()
})

describe('pruefeTelefonTyp', () => {
  it('Festnetz wird als landline erkannt (Kanal-Weiche greift)', async () => {
    global.fetch = vi.fn(() =>
      antwort({ valid: true, line_type_intelligence: { type: 'landline', carrier_name: 'DTAG' } }),
    ) as never
    await expect(pruefeTelefonTyp('+4930231255555')).resolves.toEqual({
      typ: 'landline',
      formatGueltig: true,
      carrier: 'DTAG',
    })
  })

  it('Mobilnummer wird als mobile erkannt', async () => {
    global.fetch = vi.fn(() =>
      antwort({ valid: true, line_type_intelligence: { type: 'mobile', carrier_name: 'DTAG (T-Mobile)' } }),
    ) as never
    const r = await pruefeTelefonTyp('+491607481923')
    expect(r.typ).toBe('mobile')
    expect(r.formatGueltig).toBe(true)
  })

  it('fixedVoip zaehlt als landline, nonFixedVoip als voip', async () => {
    global.fetch = vi.fn(() => antwort({ valid: true, line_type_intelligence: { type: 'fixedVoip' } })) as never
    expect((await pruefeTelefonTyp('+4930111')).typ).toBe('landline')
    global.fetch = vi.fn(() => antwort({ valid: true, line_type_intelligence: { type: 'nonFixedVoip' } })) as never
    expect((await pruefeTelefonTyp('+4930111')).typ).toBe('voip')
  })

  it('fehlender Typ (Musternummern liefern null) -> unbekannt, aber formatGueltig bleibt erhalten', async () => {
    global.fetch = vi.fn(() => antwort({ valid: true, line_type_intelligence: { type: null } })) as never
    await expect(pruefeTelefonTyp('+4915512345678')).resolves.toEqual({
      typ: 'unbekannt',
      formatGueltig: true,
      carrier: null,
    })
  })

  it('HTTP-Fehler -> unbekannt (fail-open, kein Wurf)', async () => {
    global.fetch = vi.fn(() => antwort({}, false, 429)) as never
    await expect(pruefeTelefonTyp('+491607481923')).resolves.toEqual({ typ: 'unbekannt', formatGueltig: false, carrier: null })
  })

  it('Netzfehler/Timeout -> unbekannt (fail-open)', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('aborted'))) as never
    await expect(pruefeTelefonTyp('+491607481923')).resolves.toEqual({ typ: 'unbekannt', formatGueltig: false, carrier: null })
  })

  it('ohne Twilio-Zugang wird gar nicht erst gefragt', async () => {
    delete process.env.TWILIO_ACCOUNT_SID
    const f = vi.fn()
    global.fetch = f as never
    await expect(pruefeTelefonTyp('+491607481923')).resolves.toEqual({ typ: 'unbekannt', formatGueltig: false, carrier: null })
    expect(f).not.toHaveBeenCalled()
  })

  it('nicht-E164 wird nicht abgefragt', async () => {
    const f = vi.fn()
    global.fetch = f as never
    await expect(pruefeTelefonTyp('0160 7481923')).resolves.toEqual({ typ: 'unbekannt', formatGueltig: false, carrier: null })
    expect(f).not.toHaveBeenCalled()
  })
})

describe('kannKurznachrichtEmpfangen', () => {
  it('landline: nein', () => expect(kannKurznachrichtEmpfangen('landline')).toBe(false))
  it('mobile/voip: ja', () => {
    expect(kannKurznachrichtEmpfangen('mobile')).toBe(true)
    expect(kannKurznachrichtEmpfangen('voip')).toBe(true)
  })
  it('unbekannt gilt als tragfaehig (fail-open, kein Lead wird blockiert)', () =>
    expect(kannKurznachrichtEmpfangen('unbekannt')).toBe(true))
})
