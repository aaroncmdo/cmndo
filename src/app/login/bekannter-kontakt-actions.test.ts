import { describe, it, expect, vi, beforeEach } from 'vitest'

const finde = vi.fn()
const createUser = vi.fn()
const listUsers = vi.fn()
const upsert = vi.fn()
const sendLoginLink = vi.fn()
const buildLink = vi.fn()
const emailLogCount = vi.fn()

vi.mock('@/lib/auth/lead-kontakt', () => ({ findeVorgaengeZuKontakt: (...a: unknown[]) => finde(...a) }))
vi.mock('@/lib/email/google/flows', () => ({ sendLoginLink: (...a: unknown[]) => sendLoginLink(...a) }))
vi.mock('@/lib/auth/welcome-link', () => ({ buildWelcomeConfirmLink: (...a: unknown[]) => buildLink(...a) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser, listUsers } },
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'maybeSingle']) q[m] = vi.fn(() => q)
      q.upsert = vi.fn((p: unknown) => { upsert(t, p); return Promise.resolve({ error: null }) })
      ;(q as { then: unknown }).then = (res: (v: unknown) => void) =>
        res(t === 'email_log' ? { count: emailLogCount(), error: null } : { data: null, error: null })
      return q
    },
  }),
}))

import { bereiteTelefonLoginVor, sendeAnmeldeLinkPerEmail } from './bekannter-kontakt-actions'

beforeEach(() => {
  for (const f of [finde, createUser, listUsers, upsert, sendLoginLink, buildLink, emailLogCount]) f.mockReset()
  emailLogCount.mockReturnValue(0)
})

describe('bereiteTelefonLoginVor', () => {
  it('unbekannte Nummer: ok, kein Konto', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    expect(await bereiteTelefonLoginVor('0177 5799941')).toEqual({ ok: true })
    expect(createUser).not.toHaveBeenCalled()
  })
  it('bekannter Lead MIT E-Mail, noch kein Konto: legt phone-bestaetigten User + Kunden-Profil an', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: 'Kai' })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    createUser.mockResolvedValue({ data: { user: { id: 'U9' } }, error: null })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(createUser).toHaveBeenCalledWith({ email: 'k@example.test', phone: '+491775799941', phone_confirm: true, email_confirm: true })
    expect(upsert).toHaveBeenCalledWith('profiles', expect.objectContaining({ id: 'U9', rolle: 'kunde', email: 'k@example.test', telefon: '+491775799941', auth_provider: 'phone', force_password_change: false }))
  })
  it('bekannter Lead OHNE E-Mail (Stufe 2): ok, aber kein Konto — profiles.email ist NOT NULL', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: null, leadVorname: null })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(createUser).not.toHaveBeenCalled()
  })
  it('Konto existiert bereits: ok, nichts anlegen', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: null })
    listUsers.mockResolvedValue({ data: { users: [{ id: 'U1', phone: '491775799941' }] }, error: null })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(createUser).not.toHaveBeenCalled()
  })
  it('createUser-Fehler (Kollision): ok nach aussen, kein Profil', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: null })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'Phone number already registered' } })
    expect(await bereiteTelefonLoginVor('+491775799941')).toEqual({ ok: true })
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('sendeAnmeldeLinkPerEmail', () => {
  it('unbekannte E-Mail: ok, kein Versand', async () => {
    finde.mockResolvedValue({ leadIds: [], claimIds: [], leadEmail: null, leadVorname: null })
    expect(await sendeAnmeldeLinkPerEmail('x@example.test')).toEqual({ ok: true })
    expect(sendLoginLink).not.toHaveBeenCalled()
  })
  it('bekannt + Konto vorhanden: Magic-Link raus', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: ['C1'], leadEmail: 'k@example.test', leadVorname: 'Kai' })
    listUsers.mockResolvedValue({ data: { users: [{ id: 'U1', email: 'k@example.test' }] }, error: null })
    buildLink.mockResolvedValue('https://app/auth/bestaetigen?token_hash=t')
    sendLoginLink.mockResolvedValue({ success: true })
    expect(await sendeAnmeldeLinkPerEmail('K@Example.test')).toEqual({ ok: true })
    expect(buildLink).toHaveBeenCalledWith('k@example.test', 'magiclink', '/kunde')
    expect(sendLoginLink).toHaveBeenCalledWith({ to: 'k@example.test', vorname: 'Kai', actionUrl: 'https://app/auth/bestaetigen?token_hash=t' })
  })
  it('bekannt, noch KEIN Konto: Konto anlegen, dann Link', async () => {
    finde.mockResolvedValue({ leadIds: ['L1'], claimIds: [], leadEmail: 'k@example.test', leadVorname: 'Kai' })
    listUsers.mockResolvedValue({ data: { users: [] }, error: null })
    createUser.mockResolvedValue({ data: { user: { id: 'U7' } }, error: null })
    buildLink.mockResolvedValue('https://app/x')
    sendLoginLink.mockResolvedValue({ success: true })
    expect(await sendeAnmeldeLinkPerEmail('k@example.test')).toEqual({ ok: true })
    expect(createUser).toHaveBeenCalledWith({ email: 'k@example.test', email_confirm: true })
    expect(upsert).toHaveBeenCalledWith('profiles', expect.objectContaining({ id: 'U7', rolle: 'kunde', email: 'k@example.test', auth_provider: 'email' }))
    expect(sendLoginLink).toHaveBeenCalled()
  })
  it('gedrosselt (3/h erreicht): ok, kein Versand, keine Suche', async () => {
    emailLogCount.mockReturnValue(3)
    expect(await sendeAnmeldeLinkPerEmail('k@example.test')).toEqual({ ok: true })
    expect(finde).not.toHaveBeenCalled()
    expect(sendLoginLink).not.toHaveBeenCalled()
  })
})
