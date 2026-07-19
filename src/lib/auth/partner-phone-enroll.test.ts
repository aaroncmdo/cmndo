import { describe, it, expect, vi, beforeEach } from 'vitest'

// Integrationstest (Teil 1): faehrt den ECHTEN Anlage-Kern (anlegePartnerKern) mit gemockter Infra
// und beweist, dass enablePhoneLogin(admin, userId, telefon) nach createUser
// aufgerufen wird — makler + (rollen-agnostisch) werkstatt.
const { enablePhoneLoginMock } = vi.hoisted(() => ({ enablePhoneLoginMock: vi.fn() }))
vi.mock('@/lib/auth/phone-login', () => ({ enablePhoneLogin: enablePhoneLoginMock }))
vi.mock('@/lib/partner/standard-staffel', () => ({ setzeStandardStaffel: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/makler/promo-code', () => ({ generatePromoCode: () => 'MK-TEST0001' }))

import { anlegePartnerKern } from '@/lib/partner/anlege-partner'

// Chainable Admin-Mock: deckt `await from(t).insert(x)` UND `from(t).insert(x).select('id').single()`.
function makeAdmin() {
  const single = vi.fn().mockResolvedValue({ data: { id: 'row1' }, error: null })
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => {
    const p: Promise<{ error: null }> & { select?: typeof select } = Promise.resolve({ error: null })
    p.select = select
    return p
  })
  const from = vi.fn(() => ({ insert }))
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  return { auth: { admin: { createUser } }, from } as unknown as Parameters<typeof anlegePartnerKern>[0]
}

beforeEach(() => {
  enablePhoneLoginMock.mockReset()
  enablePhoneLoginMock.mockResolvedValue(true)
})

describe('Partner-Anlage aktiviert Telefon-Login (Teil 1)', () => {
  it('anlegePartnerKern (makler) ruft enablePhoneLogin(admin, userId, telefon) nach createUser', async () => {
    const admin = makeAdmin()
    const r = await anlegePartnerKern(admin, 'makler', {
      firma: 'Test GmbH',
      ansprechpartnerVorname: 'Max',
      ansprechpartnerNachname: 'Muster',
      email: 'm@example.de',
      telefon: '0175 1234567',
      plz: null,
      ort: null,
      aktiviertVon: null,
      rollenDetails: {
        provision_betrag_komplett_netto: 100,
        provision_betrag_nur_gutachter_netto: 50,
      },
    })
    expect(r.ok).toBe(true)
    expect(enablePhoneLoginMock).toHaveBeenCalledWith(admin, 'u1', '0175 1234567')
  })

  it('anlegePartnerKern (werkstatt) ruft enablePhoneLogin rollen-agnostisch', async () => {
    const admin = makeAdmin()
    const r = await anlegePartnerKern(admin, 'werkstatt', {
      firma: 'Auto Test',
      ansprechpartnerVorname: 'Eva',
      ansprechpartnerNachname: 'Werk',
      email: 'w@example.de',
      telefon: '+491519998887',
      plz: null,
      ort: null,
      aktiviertVon: null,
      rollenDetails: {},
    })
    expect(r.ok).toBe(true)
    expect(enablePhoneLoginMock).toHaveBeenCalledWith(admin, 'u1', '+491519998887')
  })
})
