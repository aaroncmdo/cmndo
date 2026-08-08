import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression-Guard fuer #3288 (Task-Reminder Partial-Success + Email-Fallback).
// Mock-Infrastruktur hoisted, damit die vi.mock-Faktoren sie referenzieren koennen
// (Idiom aus start-link/__tests__/send-flowlink-multichannel.test.ts).
const h = vi.hoisted(() => {
  const state = {
    q: [] as Array<{ data?: unknown; error?: unknown }>,
    updateCalls: [] as Array<Record<string, unknown>>,
    insertCalls: [] as Array<Record<string, unknown>>,
  }
  const next = () => state.q.shift() ?? { data: null, error: null }
  const makeBuilder = () => {
    const b: Record<string, unknown> = {}
    b.select = () => b
    b.eq = () => b
    b.in = () => b
    b.is = () => b
    b.lt = () => b
    b.like = () => b
    b.order = () => b
    b.limit = () => b
    b.single = () => Promise.resolve(next())
    b.maybeSingle = () => Promise.resolve(next())
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(next()).then(res)
    return b
  }
  const db = {
    from: () => ({
      select: () => makeBuilder(),
      update: (p: Record<string, unknown>) => { state.updateCalls.push(p); return makeBuilder() },
      insert: (p: Record<string, unknown>) => { state.insertCalls.push(p); return makeBuilder() },
    }),
  }
  const sendWhatsApp = vi.fn(async () => ({ success: true, error: undefined as string | undefined }))
  const sendEmail = vi.fn(async () => {})
  return { state, db, sendWhatsApp, sendEmail }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db }))
vi.mock('@/lib/whatsapp', () => ({ sendWhatsApp: h.sendWhatsApp }))
vi.mock('@/lib/email/google/client', () => ({ sendEmail: h.sendEmail }))

import { sendTaskReminder, eskaliereOffeneTerminwuensche } from './reminder-sender'

const lastUpdate = () => h.state.updateCalls.at(-1) as Record<string, unknown> | undefined

beforeEach(() => {
  h.state.q = []
  h.state.updateCalls.length = 0
  h.state.insertCalls.length = 0
  vi.clearAllMocks()
})

describe('sendTaskReminder — Zustell-Semantik (#3288)', () => {
  it('Partial-Success: system stellt zu, WhatsApp ohne Nummer -> sent (nicht failed)', async () => {
    h.state.q = [
      { data: { id: 'r1', task_id: 't1', reminder_typ: 'overdue_2h', kanal: 'system+whatsapp', status: 'pending', versuche: 0, empfaenger_rolle: 'admin' } },
      { data: { id: 't1', fall_id: 'fall-1', titel: 'Test', status: 'offen', prioritaet: 'kritisch', zugewiesen_an: 'u1', empfaenger_user_id: null } },
      { data: { id: 'u1', vorname: 'A', nachname: 'B', email: 'a@b.de', telefon: null } },
      { error: null }, // nachrichten-insert (system) erfolgreich
      { error: null }, // finale task_reminders-update
    ]
    await sendTaskReminder('r1')
    // Frueher: ein WhatsApp-no-phone liess den GANZEN Reminder als failed gelten.
    expect(lastUpdate()).toMatchObject({ status: 'sent' })
    expect(String(lastUpdate()?.fehler)).toContain('whatsapp: uebersprungen')
    expect(h.state.insertCalls).toHaveLength(1) // system hat in nachrichten geschrieben = zugestellt
  })

  it('Email-Fallback: fall-loser Task ohne Telefon, aber mit Email -> per Email zugestellt', async () => {
    h.state.q = [
      { data: { id: 'r2', task_id: 't2', reminder_typ: 'overdue_2h', kanal: 'system+whatsapp', status: 'pending', versuche: 0 } },
      { data: { id: 't2', fall_id: null, titel: 'Admin-Task', status: 'offen', prioritaet: 'dringend', zugewiesen_an: 'u2', empfaenger_user_id: null } },
      { data: { id: 'u2', vorname: 'C', nachname: 'D', email: 'admin@x.de', telefon: null } },
      { error: null }, // finale update
    ]
    await sendTaskReminder('r2')
    // system nicht zustellbar (kein fall_id) + WhatsApp ohne Nummer -> Last-Resort-Email.
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    expect(lastUpdate()).toMatchObject({ status: 'sent' })
    expect(String(lastUpdate()?.fehler)).toContain('email-fallback: zugestellt')
    expect(h.state.insertCalls).toHaveLength(0) // kein fall_id -> system schreibt nicht
  })

  it('Kein zustellbarer Kanal (fall-los, kein Telefon, keine Email) -> failed', async () => {
    h.state.q = [
      { data: { id: 'r3', task_id: 't3', reminder_typ: 'pre_2h', kanal: 'system+whatsapp', status: 'pending', versuche: 1 } },
      { data: { id: 't3', fall_id: null, titel: 'X', status: 'offen', prioritaet: 'normal', zugewiesen_an: 'u3', empfaenger_user_id: null } },
      { data: { id: 'u3', vorname: 'E', nachname: 'F', email: null, telefon: null } },
      { error: null }, // finale update
    ]
    await sendTaskReminder('r3')
    expect(h.sendEmail).toHaveBeenCalledTimes(0) // kein Email-Fallback ohne Email
    expect(lastUpdate()).toMatchObject({ status: 'failed' })
  })

  it('Task erledigt -> Reminder cancelled (kein Send-Versuch)', async () => {
    h.state.q = [
      { data: { id: 'r4', task_id: 't4', reminder_typ: 'pre_2h', kanal: 'system+whatsapp', status: 'pending', versuche: 0 } },
      { data: { id: 't4', fall_id: 'f4', titel: 'Y', status: 'erledigt' } },
      { error: null }, // cancelled update
    ]
    await sendTaskReminder('r4')
    expect(h.state.updateCalls).toHaveLength(1)
    expect(h.state.updateCalls[0]).toMatchObject({ status: 'cancelled' })
    expect(h.state.insertCalls).toHaveLength(0)
  })

  it('Reminder nicht mehr pending -> no-op', async () => {
    h.state.q = [{ data: { id: 'r5', status: 'sent' } }]
    await sendTaskReminder('r5')
    expect(h.state.updateCalls).toHaveLength(0)
    expect(h.state.insertCalls).toHaveLength(0)
  })
})

describe('eskaliereOffeneTerminwuensche — 24h-SLA-Eskalation (T3 Task 11)', () => {
  beforeEach(() => {
    h.state.q = []
    h.state.updateCalls.length = 0
    h.state.insertCalls.length = 0
    vi.clearAllMocks()
  })

  it('keine ueberfaelligen Terminwuensche -> kein Query-Overhead, keine Mitteilung', async () => {
    h.state.q = [{ data: [], error: null }] // gutachter_termine: nichts > 24h offen
    await eskaliereOffeneTerminwuensche()
    expect(h.state.insertCalls).toHaveLength(0)
  })

  it('ueberfaellige Terminwuensche + keine vorherige Eskalation -> EINE aggregierte Mitteilung', async () => {
    h.state.q = [
      { data: [{ id: 't1' }, { id: 't2' }, { id: 't3' }], error: null }, // 3 ueberfaellig
      { data: null, error: null }, // Dedup: keine vorherige Eskalation gefunden
      { data: [{ id: 'disp-1' }], error: null }, // profiles rolle=dispatch
      { data: { id: 'mit-1' }, error: null }, // mitteilungen-insert (createMitteilung fuer disp-1)
    ]
    await eskaliereOffeneTerminwuensche()
    expect(h.state.insertCalls).toHaveLength(1)
    expect(h.state.insertCalls[0]).toMatchObject({
      empfaenger_id: 'disp-1',
      empfaenger_rolle: 'dispatch',
      kategorie: 'update',
      prioritaet: 'dringend',
      titel: 'Terminwunsch wartet > 24 h (3 offen)',
      route_url: '/dispatch/terminwuensche',
    })
  })

  it('bereits < 24h eskaliert -> kein Re-Fire (Spam-Guard fuer den stuendlichen Cron)', async () => {
    h.state.q = [
      { data: [{ id: 't1' }], error: null },
      { data: { created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, error: null }, // vor 1h
    ]
    await eskaliereOffeneTerminwuensche()
    expect(h.state.insertCalls).toHaveLength(0)
  })

  it('letzte Eskalation > 24h her -> re-fired', async () => {
    h.state.q = [
      { data: [{ id: 't1' }], error: null },
      { data: { created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }, error: null }, // vor 25h
      { data: [{ id: 'disp-1' }], error: null },
      { data: { id: 'mit-1' }, error: null },
    ]
    await eskaliereOffeneTerminwuensche()
    expect(h.state.insertCalls).toHaveLength(1)
    expect(h.state.insertCalls[0]).toMatchObject({ titel: 'Terminwunsch wartet > 24 h (1 offen)' })
  })

  it('kein Dispatch-User im System -> kein Insert (non-fatal, nichts zum Adressieren)', async () => {
    h.state.q = [
      { data: [{ id: 't1' }], error: null },
      { data: null, error: null },
      { data: [], error: null }, // profiles: keine Dispatch-User
    ]
    await eskaliereOffeneTerminwuensche()
    expect(h.state.insertCalls).toHaveLength(0)
  })

  it('DB-Fehler bei der Ueberfaellig-Query -> wirft nicht (non-fatal, Cron-Lauf bleibt unbeeintraechtigt)', async () => {
    h.state.q = [{ data: null, error: { message: 'boom' } }]
    await expect(eskaliereOffeneTerminwuensche()).resolves.toBeUndefined()
    expect(h.state.insertCalls).toHaveLength(0)
  })
})
