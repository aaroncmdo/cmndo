import { describe, it, expect, vi, beforeEach } from 'vitest'

let authUser: { id: string } | null = { id: 'kb-1' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: authUser } }) } }),
}))

// Termin-Row lebt auf gutachter_termine; die interne Notiz (Kunde-Leak-Fix) auf
// gutachter_termine_intern (Staff-only) -> table-aware Mock.
let terminRow: Record<string, unknown> | null = null
let internRow: { notiz_intern: string | null } | null = null
const updateCalls: unknown[] = []
const insertCalls: unknown[] = []
const upsertCalls: Array<{ table: string; payload: Record<string, unknown> }> = []
let updateError: unknown = null
let upsertError: unknown = null
let internReadError: unknown = null
function makeAdmin() {
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            t === 'gutachter_termine_intern'
              ? { data: internRow, error: internReadError }
              : { data: terminRow, error: null },
        }),
      }),
      update: (p: unknown) => { updateCalls.push(p); return { eq: async () => ({ error: updateError }) } },
      insert: async (p: unknown) => { insertCalls.push(p); return { error: null } },
      upsert: async (p: Record<string, unknown>) => { upsertCalls.push({ table: t, payload: p }); return { error: upsertError } },
    }),
  }
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

const coreMock = vi.fn(async (..._a: unknown[]) => ({ success: true, token: 't' }))
vi.mock('@/lib/start-link/send-flowlink-multichannel', () => ({ sendFlowLinkMultiChannelCore: (...a: unknown[]) => coreMock(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendeKonsultationsFlowLink, protokolliereKonsultation } from '../actions'

beforeEach(() => {
  authUser = { id: 'kb-1' }; terminRow = null; internRow = null
  updateError = null; upsertError = null; internReadError = null
  updateCalls.length = 0; insertCalls.length = 0; upsertCalls.length = 0; coreMock.mockClear()
})

const eigenerTermin = { id: 't1', typ: 'kb_beratung', kb_id: 'kb-1', lead_id: 'lead-1', start_zeit: '2026-06-25T08:00:00Z', status: 'reserviert' }

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
    expect(upsertCalls.length).toBe(0)
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
  it('durchgefuehrt setzt durchgefuehrt_am (gt) + Notiz via intern-Upsert + timeline', async () => {
    terminRow = eigenerTermin
    const r = await protokolliereKonsultation('t1', 'durchgefuehrt', 'Kunde will weitermachen')
    expect(r.ok).toBe(true)
    const upd = updateCalls.at(-1) as Record<string, unknown>
    expect(upd.durchgefuehrt_am).toBeTruthy()
    // notiz_intern geht NICHT mehr auf gutachter_termine (Spalte ausgelagert) ...
    expect(upd.notiz_intern).toBeUndefined()
    // ... sondern per Upsert in gutachter_termine_intern
    const ups = upsertCalls.at(-1)
    expect(ups?.table).toBe('gutachter_termine_intern')
    expect(ups?.payload.termin_id).toBe('t1')
    expect(String(ups?.payload.notiz_intern)).toContain('Durchgeführt')
    expect(String(ups?.payload.notiz_intern)).toContain('Kunde will weitermachen')
    expect(insertCalls.at(-1)).toMatchObject({ titel: 'KB-Beratung: Durchgeführt', lead_id: 'lead-1' })
  })
  it('nicht_erreicht schreibt NUR die intern-Notiz, kein gt-Update', async () => {
    terminRow = eigenerTermin
    const r = await protokolliereKonsultation('t1', 'nicht_erreicht')
    expect(r.ok).toBe(true)
    expect(updateCalls.length).toBe(0)
    const ups = upsertCalls.at(-1)
    expect(ups?.table).toBe('gutachter_termine_intern')
    expect(String(ups?.payload.notiz_intern)).toContain('Nicht erreicht')
  })
  it('haengt an bestehende intern-Notiz an (Append-Semantik)', async () => {
    terminRow = eigenerTermin
    internRow = { notiz_intern: 'Alte Zeile' }
    const r = await protokolliereKonsultation('t1', 'nicht_erreicht')
    expect(r.ok).toBe(true)
    const notiz = String(upsertCalls.at(-1)?.payload.notiz_intern)
    expect(notiz.startsWith('Alte Zeile\n')).toBe(true)
    expect(notiz).toContain('Nicht erreicht')
  })
  it('intern-READ-Fehler → ok:false OHNE Upsert (kein Historien-Overwrite)', async () => {
    terminRow = eigenerTermin
    internRow = { notiz_intern: 'Alte Zeile' }
    internReadError = { message: 'read kaputt' }
    const r = await protokolliereKonsultation('t1', 'nicht_erreicht')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('read kaputt')
    expect(upsertCalls.length).toBe(0)
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
  it('gt-Update-Fehler → ok:false (kein intern-Upsert danach)', async () => {
    terminRow = eigenerTermin; updateError = { message: 'DB kaputt' }
    const r = await protokolliereKonsultation('t1', 'durchgefuehrt')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('DB kaputt')
    expect(upsertCalls.length).toBe(0)
  })
  it('intern-Upsert-Fehler → ok:false', async () => {
    terminRow = eigenerTermin; upsertError = { message: 'intern kaputt' }
    const r = await protokolliereKonsultation('t1', 'nicht_erreicht')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('intern kaputt')
  })
})
