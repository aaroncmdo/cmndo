import { describe, it, expect, vi, beforeEach } from 'vitest'

// AAR-956 Dead-Pin-Fallback (b2) — Tests fuer generischeDeadPinSlots (pure) +
// bucheDeadPinTermin (write-only). bucheDeadPinTermin nutzt createAdminClient() intern
// (Vertrag BucheDeadPinTermin nimmt nur {token,deadPinId,startIso}) und revalidatePath —
// beide ueber vi.hoisted injizierbar. DB-Insert-Payload wird gegen die live-verifizierten
// Constraints geprueft (assignee_typ=sv_lead, status=dispatch_pending, KEIN lead_id/kanal).
const h = vi.hoisted(() => ({ db: null as unknown, revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db }))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }))

import { generischeDeadPinSlots } from '../lade-deadpin-fallback'
import { bucheDeadPinTermin } from '../buche-deadpin-termin'

// Thenable-Recorder-Stub (gespiegelt von engine/state-transitions.test.ts): jeder Terminal
// (maybeSingle/single ODER awaited Builder) konsumiert die naechste Antwort; insert-Payload
// wird gecaptured.
type Resp = { data?: unknown; error?: { code?: string; message: string } | null }
function makeDb(script: Resp[]) {
  let i = 0
  const calls: Array<Record<string, unknown>> = []
  const next = (): Resp => script[i++] ?? { data: null, error: null }
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    calls,
    from(t: string) { calls.push({ from: t }); return b },
    select() { return b },
    insert(p: unknown) { calls.push({ insert: p }); return b },
    update(p: unknown) { calls.push({ update: p }); return b },
    eq() { return b },
    limit() { return b },
    maybeSingle() { return Promise.resolve(next()) },
    single() { return Promise.resolve(next()) },
    then(res: (v: Resp) => void) { res(next()) },
  })
  return b
}

const berlinWeekday = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }).format(new Date(iso))

describe('generischeDeadPinSlots', () => {
  const jetzt = new Date('2026-06-15T05:00:00Z') // Montag
  const slots = generischeDeadPinSlots(jetzt)

  it('liefert Zukunfts-Slots mit 90-Minuten-Dauer und matchType nach', () => {
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(new Date(s.start).getTime()).toBeGreaterThan(jetzt.getTime())
      expect(new Date(s.end).getTime() - new Date(s.start).getTime()).toBe(90 * 60_000)
      expect(s.matchType).toBe('nach')
      expect(typeof s.start).toBe('string')
    }
  })

  it('enthaelt keinen Sonntag', () => {
    for (const s of slots) expect(berlinWeekday(s.start)).not.toBe('Sun')
  })
})

describe('bucheDeadPinTermin', () => {
  beforeEach(() => h.revalidatePath.mockClear())

  it('insert-Payload: assignee sv_lead + status dispatch_pending + bezug lead, KEIN lead_id/kanal', async () => {
    h.db = makeDb([
      { data: { lead_id: 'lead-1', status: 'geoeffnet', expires_at: null }, error: null }, // flow_links
      { data: { id: 'term-1' }, error: null }, // insert single
      { data: { zugewiesen_an: 'disp-assigned', unfallort_ort: 'Musterstadt', unfallort_plz: '12345' }, error: null }, // leads (Notify-Kontext)
      { data: { id: 'mit-1' }, error: null }, // mitteilungen-insert (createMitteilung, T3 Task 11)
    ])
    const r = await bucheDeadPinTermin({ token: 'tok', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.terminId).toBe('term-1')

    const calls = (h.db as { calls: Array<Record<string, unknown>> }).calls
    const inserts = calls.filter((c) => 'insert' in c)
    const ins = inserts[0].insert as Record<string, unknown>
    expect(ins.assignee_typ).toBe('sv_lead')
    expect(ins.assignee_id).toBe('pin-1')
    expect(ins.sv_lead_id).toBe('pin-1') // Legacy-FK-Dual-Write via assigneeLegacyPatch
    expect(ins.bezug_typ).toBe('lead')
    expect(ins.bezug_id).toBe('lead-1')
    expect(ins.status).toBe('dispatch_pending')
    expect(ins.start_zeit).toBe('2026-06-20T07:00:00.000Z')
    expect(new Date(ins.end_zeit as string).getTime() - new Date(ins.start_zeit as string).getTime()).toBe(90 * 60_000)
    expect(ins.quelle).toBe('self_service')
    expect(ins.typ).toBe('sv_begutachtung')
    expect('lead_id' in ins).toBe(false) // KEIN Legacy-bezug (validate-Trigger-Falle + Doppelmatch)
    expect('kanal' in ins).toBe(false) // kanal-CHECK erlaubt nur telefon/video -> weglassen (Vor-Ort)
    expect(h.revalidatePath).toHaveBeenCalledWith('/dispatch/leads')
    expect(h.revalidatePath).toHaveBeenCalledWith('/dispatch/terminwuensche')

    // T3 Task 11: In-App-Dispatch-Notification — EIN Empfaenger (hier: der dem Lead
    // bereits zugewiesene Dispatcher, kein Profiles-Fallback noetig).
    expect(inserts).toHaveLength(2)
    const mitteilung = inserts[1].insert as Record<string, unknown>
    expect(mitteilung.empfaenger_id).toBe('disp-assigned')
    expect(mitteilung.empfaenger_rolle).toBe('dispatch')
    expect(mitteilung.titel).toBe('Neuer Gutachter-Terminwunsch (12345 Musterstadt, Wunsch: 20.06. 09:00 Uhr)')
    expect(mitteilung.route_url).toBe('/dispatch/terminwuensche')
  })

  it('Notify-Fallback: kein zugewiesener Dispatcher -> erster Dispatch-User + "unbekannt" ohne Ort', async () => {
    h.db = makeDb([
      { data: { lead_id: 'lead-1', status: 'geoeffnet', expires_at: null }, error: null }, // flow_links
      { data: { id: 'term-1' }, error: null }, // insert single
      { data: { zugewiesen_an: null, unfallort_ort: null, unfallort_plz: null }, error: null }, // leads
      { data: { id: 'disp-fallback' }, error: null }, // profiles-Fallback (erster Dispatch-User)
      { data: { id: 'mit-1' }, error: null }, // mitteilungen-insert
    ])
    const r = await bucheDeadPinTermin({ token: 'tok', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(true)

    const calls = (h.db as { calls: Array<Record<string, unknown>> }).calls
    const inserts = calls.filter((c) => 'insert' in c)
    expect(inserts).toHaveLength(2)
    const mitteilung = inserts[1].insert as Record<string, unknown>
    expect(mitteilung.empfaenger_id).toBe('disp-fallback')
    expect(mitteilung.titel).toBe('Neuer Gutachter-Terminwunsch (unbekannt, Wunsch: 20.06. 09:00 Uhr)')
  })

  it('Kein Dispatch-User verfuegbar -> Notify wird uebersprungen, Buchung bleibt ok:true', async () => {
    h.db = makeDb([
      { data: { lead_id: 'lead-1', status: 'geoeffnet', expires_at: null }, error: null }, // flow_links
      { data: { id: 'term-1' }, error: null }, // insert single
      { data: { zugewiesen_an: null, unfallort_ort: 'Musterstadt', unfallort_plz: '12345' }, error: null }, // leads
      { data: null, error: null }, // profiles-Fallback: kein Dispatch-User im System
    ])
    const r = await bucheDeadPinTermin({ token: 'tok', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.terminId).toBe('term-1')

    const calls = (h.db as { calls: Array<Record<string, unknown>> }).calls
    // KEIN Empfaenger auflösbar -> createMitteilung wird gar nicht erst aufgerufen
    // (kein zweiter insert), aber die Buchung selbst bleibt unberuehrt erfolgreich.
    expect(calls.filter((c) => 'insert' in c)).toHaveLength(1)
  })

  it('ungueltiger Token -> ok:false, kein Insert, kein revalidate', async () => {
    h.db = makeDb([{ data: null, error: null }]) // flow_links: kein Treffer
    const r = await bucheDeadPinTermin({ token: 'bad', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(false)
    const calls = (h.db as { calls: Array<Record<string, unknown>> }).calls
    expect(calls.some((c) => 'insert' in c)).toBe(false)
    expect(h.revalidatePath).not.toHaveBeenCalled()
  })

  it('abgelaufener Link -> ok:false', async () => {
    h.db = makeDb([{ data: { lead_id: 'lead-1', status: 'geoeffnet', expires_at: '2000-01-01T00:00:00Z' }, error: null }])
    const r = await bucheDeadPinTermin({ token: 'tok', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(false)
  })

  it('abgeschlossener Link -> ok:false', async () => {
    h.db = makeDb([{ data: { lead_id: 'lead-1', status: 'abgeschlossen', expires_at: null }, error: null }])
    const r = await bucheDeadPinTermin({ token: 'tok', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(false)
  })

  it('Insert-Fehler -> ok:false mit Fehlertext', async () => {
    h.db = makeDb([
      { data: { lead_id: 'lead-1', status: 'geoeffnet', expires_at: null }, error: null },
      { data: null, error: { code: '23514', message: 'check constraint' } },
    ])
    const r = await bucheDeadPinTermin({ token: 'tok', deadPinId: 'pin-1', startIso: '2026-06-20T07:00:00.000Z' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('check constraint')
  })
})
