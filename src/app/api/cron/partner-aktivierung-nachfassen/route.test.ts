import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock-Zustand: der Admin-Client wird komplett gestubbt, damit die Route ohne DB laeuft.
// vorhandeneCodes  -> simuliert bereits existierende Tasks (Dedupe-Pfad)
// offeneTasks      -> simuliert offene Aktivierungs-Tasks (Selbstheilungs-Pfad)
// loginAt          -> userId -> last_sign_in_at (fehlt = nie eingeloggt)
const h = vi.hoisted(() => ({
  assertCronAuth: vi.fn(() => true),
  // Parameter-Typ explizit: sonst ist mock.calls ein leeres Tupel und calls[0][0]
  // existiert typ-seitig nicht (TS2493/TS2352 im CI-Typecheck).
  createLinkedTask: vi.fn(async (_params: Record<string, unknown>) => ({ task_id: 't-neu' })),
  findStuckPartnerAccounts: vi.fn(),
  adminState: {
    vorhandeneCodes: [] as string[],
    offeneTasks: [] as Array<{ id: string; task_code: string }>,
    loginAt: {} as Record<string, string | null>,
    updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  },
}))

vi.mock('@/lib/auth/cron-auth', () => ({ assertCronAuth: h.assertCronAuth }))
vi.mock('@/lib/tasks/create-task', () => ({ createLinkedTask: h.createLinkedTask }))
vi.mock('@/lib/partner/stuck-accounts', () => ({ findStuckPartnerAccounts: h.findStuckPartnerAccounts }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      // Beide tasks-Queries enden auf .limit() -> eine einzige Aufloesungsstelle.
      // Die Dedupe-Query selektiert 'id', die Selbstheilungs-Query 'id, task_code'.
      const st = { istOffeneQuery: false, code: '' }
      const q: Record<string, unknown> = {}
      q.select = (cols: string) => {
        st.istOffeneQuery = cols.includes('task_code')
        return q
      }
      q.eq = (col: string, val: string) => {
        if (col === 'task_code') st.code = val
        return q
      }
      q.like = () => q
      q.limit = () =>
        Promise.resolve({
          data: st.istOffeneQuery
            ? h.adminState.offeneTasks
            : h.adminState.vorhandeneCodes.includes(st.code)
              ? [{ id: 'vorhanden' }]
              : [],
          error: null,
        })
      q.update = (patch: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          h.adminState.updates.push({ id, patch })
          return Promise.resolve({ error: null })
        },
      })
      return q
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, last_sign_in_at: h.adminState.loginAt[id] ?? null } },
          error: null,
        }),
      },
    },
  }),
}))

const P = (userId: string) => ({
  userId,
  email: `${userId}@extern.de`,
  rolle: 'werkstatt',
  name: `Firma ${userId}`,
  telefon: `+4917000000${userId}`,
  seit: '2026-06-01T00:00:00Z',
})

async function callGET() {
  const { GET } = await import('./route')
  return GET(new Request('https://app.claimondo.de/api/cron/partner-aktivierung-nachfassen'))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  h.assertCronAuth.mockReturnValue(true)
  h.createLinkedTask.mockResolvedValue({ task_id: 't-neu' })
  h.adminState.vorhandeneCodes = []
  h.adminState.offeneTasks = []
  h.adminState.loginAt = {}
  h.adminState.updates = []
})

describe('cron partner-aktivierung-nachfassen', () => {
  it('401 ohne Cron-Auth', async () => {
    h.assertCronAuth.mockReturnValue(false)
    const res = await callGET()
    expect(res.status).toBe(401)
    expect(h.createLinkedTask).not.toHaveBeenCalled()
  })

  it('erzeugt pro totem Partner einen Admin-Task mit task_code und OHNE entity_type', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [P('u1')] })
    const res = await callGET()
    const body = await res.json()
    expect(body).toMatchObject({ geprueft: 1, tasks_erstellt: 1, uebersprungen_cap: 0 })
    expect(h.createLinkedTask).toHaveBeenCalledTimes(1)
    const arg = h.createLinkedTask.mock.calls[0][0]
    expect(arg.task_code).toBe('partner-aktivierung:u1')
    expect(arg.empfaenger_rolle).toBe('admin')
    expect(arg.prioritaet).toBe('normal')
    expect(arg.entity_type).toBeUndefined()
    expect(arg.entity_id).toBeUndefined()
    expect(String(arg.titel)).toContain('Firma u1')
    expect(String(arg.beschreibung)).toContain('+4917000000u1')
  })

  it('kein zweiter Task wenn der task_code schon existiert — auch wenn erledigt (kein Nag-Loop)', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [P('u1')] })
    h.adminState.vorhandeneCodes = ['partner-aktivierung:u1']
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_erstellt).toBe(0)
    expect(h.createLinkedTask).not.toHaveBeenCalled()
  })

  it('Safety-Cap: hoechstens 25 Tasks pro Lauf, Rest als uebersprungen_cap gemeldet', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({
      ok: true,
      partner: Array.from({ length: 30 }, (_, i) => P(`u${i}`)),
    })
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_erstellt).toBe(25)
    expect(body.uebersprungen_cap).toBe(5)
    expect(h.createLinkedTask).toHaveBeenCalledTimes(25)
  })

  it('Selbstheilung: schliesst offene Tasks, deren Partner sich inzwischen eingeloggt hat', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [] })
    h.adminState.offeneTasks = [{ id: 't9', task_code: 'partner-aktivierung:u9' }]
    h.adminState.loginAt = { u9: '2026-07-15T10:00:00Z' }
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_geschlossen).toBe(1)
    expect(h.adminState.updates).toEqual([{ id: 't9', patch: { status: 'erledigt' } }])
  })

  it('Selbstheilung laesst Tasks offen, deren Partner weiterhin nie eingeloggt ist', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: true, partner: [] })
    h.adminState.offeneTasks = [{ id: 't9', task_code: 'partner-aktivierung:u9' }]
    const res = await callGET()
    const body = await res.json()
    expect(body.tasks_geschlossen).toBe(0)
    expect(h.adminState.updates).toEqual([])
  })

  it('Detektor-Fehler -> 500, kein Task', async () => {
    h.findStuckPartnerAccounts.mockResolvedValue({ ok: false, error: 'boom' })
    const res = await callGET()
    expect(res.status).toBe(500)
    expect(h.createLinkedTask).not.toHaveBeenCalled()
  })
})
