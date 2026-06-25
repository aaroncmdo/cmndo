import { describe, it, expect, vi, beforeEach } from 'vitest'

let adminRolle = 'admin'
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { rolle: adminRolle } }) }) }) }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let createUserResult: { data: { user: { id: string } | null }; error: { message: string } | null } = {
  data: { user: { id: 'user-1' } }, error: null,
}
let profileInsertError: { message: string } | null = null
let maklerInsertResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: 'makler-1' }, error: null,
}
let promoInsertError: { message: string } | null = null
const calls: string[] = []

function makeAdmin() {
  return {
    auth: {
      admin: {
        createUser: async () => { calls.push('createUser'); return createUserResult },
        deleteUser: async () => { calls.push('deleteUser') },
      },
    },
    from: (table: string) => ({
      insert: (_p: unknown) => {
        calls.push(`insert:${table}`)
        if (table === 'profiles') return Promise.resolve({ error: profileInsertError })
        if (table === 'promotion_codes') return Promise.resolve({ error: promoInsertError })
        if (table === 'makler') return { select: () => ({ single: async () => maklerInsertResult }) }
        return Promise.resolve({ error: null })
      },
      delete: () => ({ eq: async () => { calls.push(`delete:${table}`); return { error: null } } }),
    }),
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

import { createMakler } from '../actions'

function fd(obj: Record<string, string>) {
  const f = new FormData()
  for (const k in obj) f.set(k, obj[k])
  return f
}

beforeEach(() => {
  adminRolle = 'admin'; calls.length = 0
  createUserResult = { data: { user: { id: 'user-1' } }, error: null }
  profileInsertError = null
  maklerInsertResult = { data: { id: 'makler-1' }, error: null }
  promoInsertError = null
})

describe('createMakler', () => {
  it('happy path: user->profile->makler->promo + ok mit Credentials', async () => {
    const r = await createMakler(fd({ firma: 'Test GmbH', email: 'A@B.de' }))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.email).toBe('a@b.de'); expect(r.password).toBeTruthy() }
    expect(calls).toEqual(['createUser', 'insert:profiles', 'insert:makler', 'insert:promotion_codes'])
  })

  it('Nicht-Admin -> abgelehnt, kein createUser', async () => {
    adminRolle = 'kunde'
    const r = await createMakler(fd({ firma: 'X', email: 'a@b.de' }))
    expect(r.ok).toBe(false)
    expect(calls).not.toContain('createUser')
  })

  it('Pflichtfelder fehlen -> Fehler', async () => {
    const r = await createMakler(fd({ firma: '', email: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Pflicht')
  })

  it('profile-Fehler -> deleteUser rollback, ok:false', async () => {
    profileInsertError = { message: 'profile kaputt' }
    const r = await createMakler(fd({ firma: 'X', email: 'a@b.de' }))
    expect(r.ok).toBe(false)
    expect(calls).toContain('deleteUser')
    expect(calls).not.toContain('insert:makler')
  })

  it('makler-Fehler -> profile-delete + deleteUser rollback', async () => {
    maklerInsertResult = { data: null, error: { message: 'makler kaputt' } }
    const r = await createMakler(fd({ firma: 'X', email: 'a@b.de' }))
    expect(r.ok).toBe(false)
    expect(calls).toContain('delete:profiles')
    expect(calls).toContain('deleteUser')
  })

  it('promo-Fehler (non-duplicate) ist non-fatal -> ok:true', async () => {
    promoInsertError = { message: 'irgendwas' }
    const r = await createMakler(fd({ firma: 'X', email: 'a@b.de' }))
    expect(r.ok).toBe(true)
  })
})
