import { describe, it, expect, vi, beforeEach } from 'vitest'
import { anlegeFlottenmanagerKern } from './anlege-flottenmanager'

// Mock module dependencies
vi.mock('@/lib/auth/phone-login', () => ({
  enablePhoneLogin: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/flotte/konto-firma', () => ({
  insertFlottenmanagerKonto: vi.fn(),
}))

import { enablePhoneLogin } from '@/lib/auth/phone-login'
import { insertFlottenmanagerKonto } from '@/lib/flotte/konto-firma'

function makeAdmin({
  createUserError = null as string | null,
  userId = 'test-user-id',
  profilesInsertError = null as string | null,
  kontroInsertError = null as string | null,
} = {}) {
  const deleteUser = vi.fn().mockResolvedValue({ error: null })
  const profilesDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  return {
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue(
          createUserError
            ? { data: null, error: { message: createUserError } }
            : { data: { user: { id: userId } }, error: null },
        ),
        deleteUser,
      },
    },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          insert: vi.fn().mockResolvedValue(
            profilesInsertError ? { error: { message: profilesInsertError } } : { error: null },
          ),
          delete: vi.fn(() => profilesDelete()),
        }
      }
      return {}
    }),
    _deleteUser: deleteUser,
    _profilesDelete: profilesDelete,
  }
}

const baseInput = {
  firmaId: 'firma-123',
  email: 'fleet@example.de',
  telefon: '+49123456789',
  vorname: 'Max',
  aktiviertVon: 'admin-user-id',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('anlegeFlottenmanagerKern', () => {
  it('happy path: inserts into firmen_flotten_konten with firma_id + user_id', async () => {
    const admin = makeAdmin({ userId: 'new-user-99' })
    ;(insertFlottenmanagerKonto as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null })

    const result = await anlegeFlottenmanagerKern(admin as never, baseInput)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unexpected')
    expect(result.userId).toBe('new-user-99')
    expect(typeof result.password).toBe('string')
    expect(result.password.length).toBeGreaterThan(14)

    expect(insertFlottenmanagerKonto).toHaveBeenCalledWith(admin, {
      firmaId: 'firma-123',
      userId: 'new-user-99',
      aktiviertVon: 'admin-user-id',
    })
    expect(enablePhoneLogin).toHaveBeenCalledWith(admin, 'new-user-99', '+49123456789')
  })

  it('on profiles insert error: deleteUser is called (rollback)', async () => {
    const admin = makeAdmin({ profilesInsertError: 'profiles conflict' })
    ;(insertFlottenmanagerKonto as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null })

    const result = await anlegeFlottenmanagerKern(admin as never, baseInput)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unexpected')
    expect(result.error).toBe('profiles conflict')

    // deleteUser called for rollback
    expect(admin._deleteUser).toHaveBeenCalledWith('test-user-id')
    // konten insert never reached
    expect(insertFlottenmanagerKonto).not.toHaveBeenCalled()
  })

  it('on konten insert error: profiles.delete + deleteUser are both called (cascade rollback)', async () => {
    const admin = makeAdmin({ userId: 'rollback-user' })
    ;(insertFlottenmanagerKonto as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: 'firmen_flotten_konten constraint',
    })

    const result = await anlegeFlottenmanagerKern(admin as never, baseInput)

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unexpected')
    expect(result.error).toBe('firmen_flotten_konten constraint')

    // profiles.delete + auth deleteUser both called
    expect(admin._profilesDelete).toHaveBeenCalled()
    expect(admin._deleteUser).toHaveBeenCalledWith('rollback-user')
    // enablePhoneLogin never reached
    expect(enablePhoneLogin).not.toHaveBeenCalled()
  })
})
