import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mailer mocken: Unit-Isolation (kein echtes Rendern/Senden) + vermeidet das
// Laden von @react-email/render in der Test-Umgebung.
const { sendMaklerWelcomeMock } = vi.hoisted(() => ({ sendMaklerWelcomeMock: vi.fn() }))
vi.mock('@/lib/email/google/flows', () => ({ sendMaklerWelcome: sendMaklerWelcomeMock }))
// promo-code.ts ist 'server-only' (import bricht in vitest) -> mocken, damit der
// anlegePartnerKern-Promo-Zweig deterministisch laeuft (nicht env-abhaengig geskippt wird).
vi.mock('@/lib/makler/promo-code', () => ({ generatePromoCode: () => 'MK-TEST' }))

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
let maklerSelectResult: { data: { firma: string; email: string | null; ansprechpartner_vorname: string | null } | null } = {
  data: { firma: 'Aaron der Makler', email: 'a@b.de', ansprechpartner_vorname: 'Aaron' },
}
let promoSelectResult: { data: { code: string } | null } = { data: { code: 'MK-TEST' } }
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
      select: () => {
        // makler/promotion_codes -> konfigurierbar (resendMaklerWelcome + createMakler-Welcome-Read).
        // *_staffel_stufen -> "existiert bereits" (truthy), damit setzeStandardStaffel early-returned
        // und createMakler denselben Insert-Pfad wie in CI behaelt (kein zusaetzlicher Staffel-Insert).
        const result =
          table === 'makler' ? maklerSelectResult
          : table === 'promotion_codes' ? promoSelectResult
          : (table === 'makler_staffel_stufen' || table === 'werkstatt_staffel_stufen') ? { data: { id: 'existing' } }
          : { data: null }
        const maybeSingle = async () => result
        return { eq: () => ({ maybeSingle, limit: () => ({ maybeSingle }) }) }
      },
    }),
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

import { createMakler, resendMaklerWelcome } from '../actions'

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
  maklerSelectResult = { data: { firma: 'Aaron der Makler', email: 'a@b.de', ansprechpartner_vorname: 'Aaron' } }
  promoSelectResult = { data: { code: 'MK-TEST' } }
  sendMaklerWelcomeMock.mockReset()
})

// Minimal gueltige Eingabe. Ein NEUES Pflichtfeld der Action gehoert HIER hinein —
// sonst kippen alle Erfolgs- und Rollback-Tests gleichzeitig und das sieht aus wie
// ein Code-Defekt. Genau so passiert mit `rechtsform` (AAR-empfehlung: Pflicht fuer
// die Abrechnung): der Test blieb stehen, brach vor createUser ab, `calls` war leer.
const GUELTIG = {
  firma: 'X',
  email: 'a@b.de',
  ansprechpartner_vorname: 'Max',
  ansprechpartner_nachname: 'Muster',
  rechtsform: 'GmbH',
}

describe('createMakler', () => {
  it('happy path: user->profile->makler->promo + ok mit Credentials', async () => {
    const r = await createMakler(fd({ ...GUELTIG, firma: 'Test GmbH', email: 'A@B.de' }))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.email).toBe('a@b.de'); expect(r.password).toBeTruthy() }
    expect(calls).toEqual(['createUser', 'insert:profiles', 'insert:makler', 'insert:promotion_codes'])
  })

  it('Nicht-Admin -> abgelehnt, kein createUser', async () => {
    adminRolle = 'kunde'
    const r = await createMakler(fd(GUELTIG))
    expect(r.ok).toBe(false)
    expect(calls).not.toContain('createUser')
  })

  it('Pflichtfelder fehlen -> Fehler', async () => {
    const r = await createMakler(fd({ firma: '', email: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Pflicht')
  })

  it('Rechtsform fehlt oder ist unbekannt -> abgelehnt, kein createUser', async () => {
    const ohne = await createMakler(fd({ ...GUELTIG, rechtsform: '' }))
    expect(ohne.ok).toBe(false)
    if (!ohne.ok) expect(ohne.error).toContain('Rechtsform')
    const unbekannt = await createMakler(fd({ ...GUELTIG, rechtsform: 'Limited' }))
    expect(unbekannt.ok).toBe(false)
    expect(calls).not.toContain('createUser')
  })

  it('profile-Fehler -> deleteUser rollback, ok:false', async () => {
    profileInsertError = { message: 'profile kaputt' }
    const r = await createMakler(fd(GUELTIG))
    expect(r.ok).toBe(false)
    expect(calls).toContain('deleteUser')
    expect(calls).not.toContain('insert:makler')
  })

  it('makler-Fehler -> profile-delete + deleteUser rollback', async () => {
    maklerInsertResult = { data: null, error: { message: 'makler kaputt' } }
    const r = await createMakler(fd(GUELTIG))
    expect(r.ok).toBe(false)
    expect(calls).toContain('delete:profiles')
    expect(calls).toContain('deleteUser')
  })

  it('promo-Fehler (non-duplicate) ist non-fatal -> ok:true', async () => {
    promoInsertError = { message: 'irgendwas' }
    const r = await createMakler(fd(GUELTIG))
    expect(r.ok).toBe(true)
  })
})

describe('resendMaklerWelcome', () => {
  it('admin: laedt Makler + sendet Login-Mail mit allowInternalRecipient, ok:true', async () => {
    const r = await resendMaklerWelcome('makler-1')
    expect(r.ok).toBe(true)
    expect(sendMaklerWelcomeMock).toHaveBeenCalledTimes(1)
    expect(sendMaklerWelcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.de', firma: 'Aaron der Makler', vorname: 'Aaron' }),
      { allowInternalRecipient: true },
    )
  })

  it('Nicht-Admin -> ok:false, kein Send', async () => {
    adminRolle = 'kunde'
    const r = await resendMaklerWelcome('makler-1')
    expect(r.ok).toBe(false)
    expect(sendMaklerWelcomeMock).not.toHaveBeenCalled()
  })

  it('Makler nicht gefunden -> ok:false, kein Send', async () => {
    maklerSelectResult = { data: null }
    const r = await resendMaklerWelcome('nope')
    expect(r.ok).toBe(false)
    expect(sendMaklerWelcomeMock).not.toHaveBeenCalled()
  })

  it('Send-Fehler -> ok:false', async () => {
    sendMaklerWelcomeMock.mockRejectedValueOnce(new Error('smtp down'))
    const r = await resendMaklerWelcome('makler-1')
    expect(r.ok).toBe(false)
  })
})
