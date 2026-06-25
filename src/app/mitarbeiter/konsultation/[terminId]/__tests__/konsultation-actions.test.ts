import { describe, it, expect, vi, beforeEach } from 'vitest'

let authUser: { id: string } | null = { id: 'kb-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authUser } }) } }),
}))

let terminRow: Record<string, unknown> | null = null
const updateCalls: unknown[] = []
const insertCalls: unknown[] = []
let updateError: unknown = null
function makeAdmin() {
  return {
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: terminRow }) }) }),
      update: (p: unknown) => { updateCalls.push(p); return { eq: async () => ({ error: updateError }) } },
      insert: async (p: unknown) => { insertCalls.push(p); return { error: null } },
    }),
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

const coreMock = vi.fn(async (..._a: unknown[]) => ({ success: true, token: 't' }))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({ sendFlowLinkMultiChannelCore: (...a: unknown[]) => coreMock(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendeKonsultationsFlowLink, protokolliereKonsultation } from '../actions'

beforeEach(() => {
  authUser = { id: 'kb-1' }; terminRow = null; updateError = null
  updateCalls.length = 0; insertCalls.length = 0; coreMock.mockClear()
})

const eigenerTermin = { id: 't1', typ: 'kb_beratung', kb_id: 'kb-1', lead_id: 'lead-1', start_zeit: '2026-06-25T08:00:00Z', status: 'reserviert', notiz_intern: null }

describe('Ownership-Gate', () => {
  it('sendeKonsultationsFlowLink lehnt fremden kb_id ab', async () => {
    terminRow = { ...eigenerTermin, kb_id: 'kb-OTHER' }
    const r = await sendeKonsultationsFlowLink('t1', 'email')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('kein Zugriff')
    expect(coreMock).not.toHaveBeenCalled()
  })
  it('protokolliereKonsultation lehnt nicht-kb_beratung ab', async () => {
    terminRow = { ...eigenerTermin, typ: 'sv_begutachtung' }
    const r = await protokolliereKonsultation('t1', 'durchgefuehrt')
    expect(r.ok).toBe(false)
    expect(updateCalls.length).toBe(0)
  })
})

describe('sendeKonsultationsFlowLink', () => {
  it('ruft den Core mit admin-db + actor + ok:true', async () => {
    terminRow = eigenerTermin
    const r = await sendeKonsultationsFlowLink('t1', 'whatsapp')
    expect(r.ok).toBe(true)
    expect(coreMock).toHaveBeenCalledWith(expect.anything(), 'lead-1', 'whatsapp', 'kb-1')
  })
})

describe('protokolliereKonsultation', () => {
  it('durchgefuehrt setzt durchgefuehrt_am + notiz_intern + timeline', async () => {
    terminRow = eigenerTermin
    const r = await protokolliereKonsultation('t1', 'durchgefuehrt', 'Kunde will weitermachen')
    expect(r.ok).toBe(true)
    const upd = updateCalls.at(-1) as Record<string, unknown>
    expect(upd.durchgefuehrt_am).toBeTruthy()
    expect(upd.notiz_intern).toContain('Durchgeführt')
    expect(insertCalls.at(-1)).toMatchObject({ titel: 'KB-Beratung: Durchgeführt', lead_id: 'lead-1' })
  })
  it('verschoben ohne neuStartIso → Fehler', async () => {
    terminRow = eigenerTermin
    const r = await protokolliereKonsultation('t1', 'verschoben')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Kein neuer Termin')
  })
  it('verschoben mit Vergangenheit → Fehler', async () => {
    terminRow = eigenerTermin
    const past = new Date(Date.now() - 3600_000).toISOString()
    const r = await protokolliereKonsultation('t1', 'verschoben', undefined, past)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Zukunft')
  })
  it('verschoben mit Zukunft → start/end/status gesetzt (end=start+30min)', async () => {
    terminRow = eigenerTermin
    const future = new Date(Date.now() + 2 * 24 * 3600_000).toISOString()
    const r = await protokolliereKonsultation('t1', 'verschoben', undefined, future)
    expect(r.ok).toBe(true)
    const upd = updateCalls.at(-1) as Record<string, unknown>
    expect(upd.start_zeit).toBe(future)
    expect(upd.status).toBe('bestaetigt')
    const diff = new Date(upd.end_zeit as string).getTime() - new Date(upd.start_zeit as string).getTime()
    expect(diff).toBe(30 * 60 * 1000)
  })
  it('DB-Update-Fehler → ok:false', async () => {
    terminRow = eigenerTermin; updateError = { message: 'DB kaputt' }
    const r = await protokolliereKonsultation('t1', 'nicht_erreicht')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('DB kaputt')
  })
})
