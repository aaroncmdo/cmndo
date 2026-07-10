import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { enablePhoneLogin } from './phone-login'

type Admin = Parameters<typeof enablePhoneLogin>[0]

// Minimaler struktureller Mock — enablePhoneLogin nutzt nur admin.auth.admin.updateUserById.
function makeAdmin(result: { error: { message: string } | null } | Error) {
  const updateUserById = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  const admin = { auth: { admin: { updateUserById } } } as unknown as Admin
  return { admin, updateUserById }
}

describe('enablePhoneLogin', () => {
  // Die Fehlerpfade loggen bewusst via console.warn — im Test stummschalten,
  // damit die Ausgabe pristine bleibt.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalisiert die Nummer auf E.164 und setzt phone_confirm; gibt true zurueck', async () => {
    const { admin, updateUserById } = makeAdmin({ error: null })
    const ok = await enablePhoneLogin(admin, 'user-1', '0175 1234567')
    expect(ok).toBe(true)
    expect(updateUserById).toHaveBeenCalledWith('user-1', {
      phone: '+491751234567',
      phone_confirm: true,
    })
  })

  it('gibt false zurueck ohne Nummer und ruft die Admin-API nicht', async () => {
    const { admin, updateUserById } = makeAdmin({ error: null })
    expect(await enablePhoneLogin(admin, 'user-1', null)).toBe(false)
    expect(await enablePhoneLogin(admin, 'user-1', '')).toBe(false)
    // undefined ist per Signatur ausgeschlossen, aber toE164 haelt es ab — abgesichert.
    expect(await enablePhoneLogin(admin, 'user-1', undefined as unknown as null)).toBe(false)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('gibt false zurueck bei UNIQUE-Kollision (Error-Result), ohne zu werfen', async () => {
    const { admin } = makeAdmin({ error: { message: 'phone number already registered' } })
    expect(await enablePhoneLogin(admin, 'user-2', '+491751234567')).toBe(false)
  })

  it('gibt false zurueck wenn updateUserById wirft (fail-safe)', async () => {
    const { admin } = makeAdmin(new Error('network down'))
    expect(await enablePhoneLogin(admin, 'user-3', '+491751234567')).toBe(false)
  })
})
