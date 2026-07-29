import { describe, it, expect } from 'vitest'
import { resolveVermittlerOwnerProfil, resolveProvisionPartnerProfil, EXTERNE_PARTNER_TYPEN } from '../owner-resolution'

// Minimaler chainable Fake: from(t).select().eq()[.eq().limit()].maybeSingle() -> { data, error }
function fakeDb(rowByTable: Record<string, unknown>) {
  const make = (table: string) => {
    const c: any = {}
    c.select = () => c
    c.eq = () => c
    c.limit = () => c
    c.maybeSingle = () => Promise.resolve({ data: rowByTable[table] ?? null, error: null })
    return c
  }
  return { from: (t: string) => make(t) } as any
}

describe('resolveVermittlerOwnerProfil (Seed-Seite)', () => {
  it('makler -> null (v1 kein Graph-Knoten)', async () => {
    expect(await resolveVermittlerOwnerProfil(fakeDb({}), 'makler', 'm1')).toBeNull()
  })
  it('null typ -> null', async () => {
    expect(await resolveVermittlerOwnerProfil(fakeDb({}), null, null)).toBeNull()
  })
  it('werkstatt -> werkstaetten.user_id', async () => {
    const db = fakeDb({ werkstaetten: { user_id: 'prof-w' } })
    expect(await resolveVermittlerOwnerProfil(db, 'werkstatt', 'w1')).toBe('prof-w')
  })
  it('firmen_flotte -> firmen_flotten_konten.user_id (via konto.id)', async () => {
    const db = fakeDb({ firmen_flotten_konten: { user_id: 'prof-f' } })
    expect(await resolveVermittlerOwnerProfil(db, 'firmen_flotte', 'konto1')).toBe('prof-f')
  })
})

describe('resolveProvisionPartnerProfil (Suppression-Seite)', () => {
  it('makler/makler_empfehlung -> null (extern, nie unterdrueckt)', async () => {
    expect(await resolveProvisionPartnerProfil(fakeDb({}), 'makler', 'm1')).toBeNull()
    expect(await resolveProvisionPartnerProfil(fakeDb({}), 'makler_empfehlung', 's1')).toBeNull()
  })
  it('EXTERNE_PARTNER_TYPEN enthaelt genau makler + makler_empfehlung', () => {
    expect(EXTERNE_PARTNER_TYPEN.has('makler')).toBe(true)
    expect(EXTERNE_PARTNER_TYPEN.has('makler_empfehlung')).toBe(true)
    expect(EXTERNE_PARTNER_TYPEN.has('werkstatt')).toBe(false)
    expect(EXTERNE_PARTNER_TYPEN.has('firmen_flotte')).toBe(false)
  })
  it('werkstatt -> werkstaetten.user_id', async () => {
    const db = fakeDb({ werkstaetten: { user_id: 'prof-w' } })
    expect(await resolveProvisionPartnerProfil(db, 'werkstatt', 'w1')).toBe('prof-w')
  })
  it('firmen_flotte -> firmen_flotten_konten.user_id (via FIRMA_id, aktives Konto)', async () => {
    const db = fakeDb({ firmen_flotten_konten: { user_id: 'prof-f' } })
    expect(await resolveProvisionPartnerProfil(db, 'firmen_flotte', 'firma1')).toBe('prof-f')
  })
  it('unbekannter typ -> null', async () => {
    expect(await resolveProvisionPartnerProfil(fakeDb({}), 'sonstiges', 'x1')).toBeNull()
  })
  it('Entity ohne Treffer -> null (unaufloesbar = Status quo)', async () => {
    expect(await resolveProvisionPartnerProfil(fakeDb({}), 'werkstatt', 'w-unbekannt')).toBeNull()
  })
})
