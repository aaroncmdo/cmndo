import { describe, it, expect, vi, beforeEach } from 'vitest'

const rateLimitMock = vi.fn()
const anlegeMock = vi.fn()
const willkommenMock = vi.fn()
const geocodeMock = vi.fn()
let dedupeRow: unknown = null // Ergebnis des profiles-Email-Dedupe

vi.mock('@/lib/rate-limit/ip-rate-limit', () => ({
  checkIpRateLimit: (...a: unknown[]) => rateLimitMock(...a),
}))
vi.mock('@/lib/partner/anlege-partner', () => ({
  anlegePartnerKern: (...a: unknown[]) => anlegeMock(...a),
}))
vi.mock('@/lib/email/google/flows', () => ({
  sendWillkommenWerkstatt: (...a: unknown[]) => willkommenMock(...a),
}))
vi.mock('@/lib/mapbox/geocode', () => ({
  geocodeAdresse: (...a: unknown[]) => geocodeMock(...a),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

function makeAdmin() {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (col: string) => ({
              maybeSingle: () => Promise.resolve({ data: dedupeRow }),
              then: (f: (v: unknown) => unknown) =>
                Promise.resolve({ data: col === 'rolle' ? [] : dedupeRow }).then(f),
            }),
          }),
        }
      }
      return { insert: () => Promise.resolve({ error: null }) }
    },
  }
}

import { registriereWerkstattSelf } from '../actions'

function fd(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    firma: 'KFZ Muster GmbH',
    ansprechpartner_vorname: 'Max',
    ansprechpartner_nachname: 'Mustermann',
    email: 'info@kfz-muster.de',
    telefon: '022112345',
    adresse_strasse: 'Musterstraße 12',
    adresse_plz: '50667',
    adresse_ort: 'Köln',
    einwilligung: 'true',
    ...overrides,
  }
  const f = new FormData()
  for (const [k, v] of Object.entries(base)) f.set(k, v)
  return f
}

beforeEach(() => {
  rateLimitMock.mockReset().mockResolvedValue({ allowed: true, noIp: false })
  anlegeMock.mockReset().mockResolvedValue({ ok: true, userId: 'u1', partnerId: 'w1', password: 'pw' })
  willkommenMock.mockReset().mockResolvedValue(undefined)
  geocodeMock.mockReset().mockResolvedValue({ lat: 50.94, lng: 6.96 })
  dedupeRow = null
})

describe('registriereWerkstattSelf', () => {
  it('fehlender Werkstatt-Name -> Fehler, keine Anlage', async () => {
    const res = await registriereWerkstattSelf(fd({ firma: '' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('fehlende Strasse -> Fehler, keine Anlage', async () => {
    const res = await registriereWerkstattSelf(fd({ adresse_strasse: '' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('fehlende Einwilligung -> Fehler, keine Anlage', async () => {
    const res = await registriereWerkstattSelf(fd({ einwilligung: 'false' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('Rate-Limit -> Fehler, keine Anlage', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, noIp: false })
    const res = await registriereWerkstattSelf(fd())
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('Email existiert bereits -> Fehler, keine Anlage', async () => {
    dedupeRow = { id: 'existing' }
    const res = await registriereWerkstattSelf(fd())
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('Happy-Path: Kern mit rolle=werkstatt, aktiviertVon=null, Strasse+Kleinunternehmer in rollenDetails, Geo', async () => {
    const res = await registriereWerkstattSelf(fd())
    expect(res.ok).toBe(true)
    const [, rolle, input] = anlegeMock.mock.calls[0] as [unknown, string, Record<string, unknown>]
    expect(rolle).toBe('werkstatt')
    expect(input.aktiviertVon).toBeNull()
    expect(input.firma).toBe('KFZ Muster GmbH')
    expect(input.lat).toBe(50.94)
    const details = input.rollenDetails as Record<string, unknown>
    expect(details.adresse_strasse).toBe('Musterstraße 12')
    // Checkbox nicht gesetzt -> explizit false (regelbesteuert), NICHT null.
    expect(details.ist_kleinunternehmer).toBe(false)
    expect(willkommenMock).toHaveBeenCalledWith({ to: 'info@kfz-muster.de', werkstattName: 'KFZ Muster GmbH' })
  })

  it('Kleinunternehmer angehakt -> true in rollenDetails', async () => {
    const res = await registriereWerkstattSelf(fd({ kleinunternehmer: 'true' }))
    expect(res.ok).toBe(true)
    const input = anlegeMock.mock.calls[0][2] as Record<string, unknown>
    expect((input.rollenDetails as Record<string, unknown>).ist_kleinunternehmer).toBe(true)
  })

  it('Geocode-Fehler blockiert NICHT (lat/lng null)', async () => {
    geocodeMock.mockRejectedValue(new Error('mapbox down'))
    const res = await registriereWerkstattSelf(fd())
    expect(res.ok).toBe(true)
    const input = anlegeMock.mock.calls[0][2] as Record<string, unknown>
    expect(input.lat).toBeNull()
  })

  it('Willkommens-Mail-Fehler blockiert NICHT (Konto steht)', async () => {
    willkommenMock.mockRejectedValue(new Error('kein Link'))
    const res = await registriereWerkstattSelf(fd())
    expect(res.ok).toBe(true)
  })
})
