import { describe, it, expect, vi, beforeEach } from 'vitest'

const rateLimitMock = vi.fn()
const anlegeMock = vi.fn()
const resetPwMock = vi.fn()
let dedupeRow: unknown = null // Ergebnis des profiles-Email-Dedupe

vi.mock('@/lib/rate-limit/ip-rate-limit', () => ({
  checkIpRateLimit: (...a: unknown[]) => rateLimitMock(...a),
}))
vi.mock('@/lib/makler/anlege-makler', () => ({
  anlegeMaklerKern: (...a: unknown[]) => anlegeMock(...a),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { resetPasswordForEmail: resetPwMock } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

function makeAdmin() {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (col: string) => ({
              // dedupe: .eq('email').maybeSingle(); admins: await .eq('rolle')
              maybeSingle: () => Promise.resolve({ data: dedupeRow }),
              then: (f: (v: unknown) => unknown) =>
                Promise.resolve({ data: col === 'rolle' ? [] : dedupeRow }).then(f),
            }),
          }),
        }
      }
      if (table === 'promotion_codes') {
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.order = () => chain
        chain.limit = () => chain
        chain.maybeSingle = () => Promise.resolve({ data: { code: 'MK-X' } })
        return chain
      }
      return { insert: () => Promise.resolve({ error: null }) }
    },
  }
}

import { registriereMaklerSelf } from '../actions'

function fd(overrides: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    firma: 'Muster GmbH',
    rechtsform: 'GmbH',
    ansprechpartner_vorname: 'Max',
    ansprechpartner_nachname: 'Mustermann',
    email: 'max@muster.de',
    telefon: '015112345678',
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
  anlegeMock.mockReset().mockResolvedValue({ ok: true, userId: 'u1', maklerId: 'm1', password: 'pw' })
  resetPwMock.mockReset().mockResolvedValue({})
  dedupeRow = null
})

describe('registriereMaklerSelf', () => {
  it('fehlende Firma -> Fehler, keine Anlage', async () => {
    const res = await registriereMaklerSelf(fd({ firma: '' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('ungueltige Email -> Fehler, keine Anlage', async () => {
    const res = await registriereMaklerSelf(fd({ email: 'keine-email' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('fehlende Einwilligung -> Fehler, keine Anlage', async () => {
    const res = await registriereMaklerSelf(fd({ einwilligung: 'false' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('fehlende Rechtsform -> Fehler, keine Anlage', async () => {
    const res = await registriereMaklerSelf(fd({ rechtsform: '' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('ungueltige Rechtsform (nicht in Whitelist) -> Fehler, keine Anlage', async () => {
    const res = await registriereMaklerSelf(fd({ rechtsform: 'Piratenschiff' }))
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('Rate-Limit -> Fehler, keine Anlage', async () => {
    rateLimitMock.mockResolvedValue({ allowed: false, noIp: false })
    const res = await registriereMaklerSelf(fd())
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('Email existiert bereits -> Fehler, keine Anlage', async () => {
    dedupeRow = { id: 'existing' }
    const res = await registriereMaklerSelf(fd())
    expect(res.ok).toBe(false)
    expect(anlegeMock).not.toHaveBeenCalled()
  })

  it('Happy-Path: anlegeMaklerKern mit aktiviertVon=null + Default-Provision; ok + code', async () => {
    const res = await registriereMaklerSelf(fd())
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.code).toBe('MK-X')
    const arg = anlegeMock.mock.calls[0][1] as Record<string, unknown>
    expect(arg.aktiviertVon).toBeNull()
    expect(arg.provisionKomplett).toBe(100)
    expect(arg.firma).toBe('Muster GmbH')
    // USt-relevante Felder werden durchgereicht; Checkbox nicht gesetzt -> explizit false
    // (= regelbesteuert), NICHT null ("unbekannt" wuerde die USt-Berechnung blockieren).
    expect(arg.rechtsform).toBe('GmbH')
    expect(arg.istKleinunternehmer).toBe(false)
  })

  it('Kleinunternehmer-Checkbox angehakt -> istKleinunternehmer=true', async () => {
    const res = await registriereMaklerSelf(fd({ kleinunternehmer: 'true' }))
    expect(res.ok).toBe(true)
    const arg = anlegeMock.mock.calls[0][1] as Record<string, unknown>
    expect(arg.istKleinunternehmer).toBe(true)
  })
})
