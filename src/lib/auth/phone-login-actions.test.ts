import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateUser = vi.fn()
const verifyOtp = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { updateUser, verifyOtp } }),
}))

import { starteTelefonLoginVerify, bestaetigeTelefonLoginVerify } from './phone-login-actions'

beforeEach(() => {
  updateUser.mockReset()
  verifyOtp.mockReset()
})

describe('starteTelefonLoginVerify', () => {
  it('normalisiert E.164 und ruft updateUser({phone}); ok', async () => {
    updateUser.mockResolvedValue({ error: null })
    const r = await starteTelefonLoginVerify('0175 1234567')
    expect(r).toEqual({ ok: true })
    expect(updateUser).toHaveBeenCalledWith({ phone: '+491751234567' })
  })
  it('false bei leerer Nummer, ohne API-Call', async () => {
    const r = await starteTelefonLoginVerify('')
    expect(r.ok).toBe(false)
    expect(updateUser).not.toHaveBeenCalled()
  })
  it('Kollision -> freundliche Meldung', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Phone number already registered' } })
    const r = await starteTelefonLoginVerify('+491751234567')
    expect(r).toEqual({ ok: false, error: 'Diese Nummer ist bereits einem anderen Konto zugeordnet.' })
  })
})

describe('bestaetigeTelefonLoginVerify', () => {
  it('verifyOtp mit type phone_change; ok', async () => {
    verifyOtp.mockResolvedValue({ error: null })
    const r = await bestaetigeTelefonLoginVerify('+491751234567', '123456')
    expect(r).toEqual({ ok: true })
    expect(verifyOtp).toHaveBeenCalledWith({ phone: '+491751234567', token: '123456', type: 'phone_change' })
  })
  it('false bei nicht-6-stelligem Code, ohne API-Call', async () => {
    const r = await bestaetigeTelefonLoginVerify('+491751234567', '12')
    expect(r.ok).toBe(false)
    expect(verifyOtp).not.toHaveBeenCalled()
  })
  it('ungueltiger Code -> Meldung', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Invalid OTP token' } })
    const r = await bestaetigeTelefonLoginVerify('+491751234567', '000000')
    expect(r).toEqual({ ok: false, error: 'Ungültiger oder abgelaufener Code.' })
  })
})
