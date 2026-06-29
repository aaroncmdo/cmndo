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

import { sendTaskReminder } from './reminder-sender'

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
