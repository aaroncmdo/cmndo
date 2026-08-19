import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── SIMULATION + Regression-Guard der Reminder-Konsolidierung (#3546) ───────
// Faehrt die ECHTEN Route-Handler (send-reminders + termin-erinnerungen), nur die
// Send-Grenze (sendCommunication) ist gestubbt. Beweist end-to-end:
//   • send-reminders = alleiniger Sender: Kunde bekommt 24h + 2h je GENAU 1x
//   • termin-erinnerungen = KEIN Zweitsender (0 Kunden-Reminder, nur 48h-Docs)
//   -> kein Double-Send. Schlaegt fehl, falls jemand die 24h/2h-Sends in
//      termin-erinnerungen wieder einbaut.
// Kein echter WhatsApp-Send, keine DB — reine In-Memory-Simulation.

const h = vi.hoisted(() => {
  const state = {
    q: [] as Array<{ data?: unknown; error?: unknown }>,
    updateCalls: [] as Array<Record<string, unknown>>,
    insertTables: [] as string[],
  }
  const next = () => state.q.shift() ?? { data: null, error: null }
  const makeBuilder = () => {
    const b: Record<string, unknown> = {}
    // Nur LESE-Kettenglieder — siehe Hinweis in send-reminders/route.test.ts.
    // `or` fehlte, seit die Bezug-Umstellung bezugOrExpr() in die Query brachte.
    for (const m of ['select', 'eq', 'lte', 'gte', 'lt', 'neq', 'in', 'or', 'order', 'limit']) b[m] = () => b
    b.single = () => Promise.resolve(next())
    b.maybeSingle = () => Promise.resolve(next())
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(next()).then(res)
    return b
  }
  const db = {
    from: (table: string) => ({
      select: () => makeBuilder(),
      update: (p: Record<string, unknown>) => { state.updateCalls.push(p); return makeBuilder() },
      insert: () => { state.insertTables.push(table); return makeBuilder() },
    }),
  }
  const sendCommunication = vi.fn(async (..._args: unknown[]) => undefined)
  const resolveClaimId = vi.fn(async () => null)
  return { state, db, sendCommunication, resolveClaimId }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db }))
vi.mock('@/lib/communications/send', () => ({ sendCommunication: h.sendCommunication }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: h.resolveClaimId }))

import { GET as sendReminders } from './send-reminders/route'
import { GET as terminErinnerungen } from './termin-erinnerungen/route'

const SECRET = 'sim-secret'
const authedReq = (path: string) => new Request(`http://localhost/api/cron/${path}`, { headers: { authorization: `Bearer ${SECRET}` } })

// Sub-Sequenz der DB-Reads, die send-reminders je faelligem Kunde-Reminder macht
// (termin, claim, aktueller-Termin, sv, sv-profil, lead, final-update).
function kundeSubseq() {
  const start = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  return [
    { data: { id: 't1', assignee_id: 'sv1', fall_id: 'f1', lead_id: 'lead1', claim_id: 'c1', start_zeit: start, end_zeit: start, status: 'bestaetigt' } },
    { data: { lead_id: 'lead1', schadenort_adresse: 'Musterstr 1', schadenort_plz: '50667', schadenort_ort: 'Koeln' } },
    { data: { besichtigungsort_adresse: 'Werkstatt Koeln' } },
    { data: { id: 'sv1', profile_id: 'p1', standort_lat: null, standort_lng: null } },
    { data: { vorname: 'Sven', nachname: 'Gutmann', telefon: '+4915100000001' } },
    { data: { vorname: 'Kim', nachname: 'Kunde', telefon: '+4917100000002' } },
    { error: null },
  ]
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  h.state.q = []
  h.state.updateCalls.length = 0
  h.state.insertTables.length = 0
  vi.clearAllMocks()
})

describe('Reminder-Konsolidierung (#3546) — Double-Send-Regression', () => {
  it('send-reminders = alleiniger Sender: Kunde bekommt 24h + 2h je genau 1x', async () => {
    h.state.q = [
      // faellige Reminder-Liste: beide Touchpoints desselben Termins
      { data: [
        { id: 'r24', termin_id: 't1', reminder_typ: 'kunde_24h', empfaenger: 'kunde', geplant_fuer: new Date().toISOString(), status: 'pending', versuche: 0 },
        { id: 'r1h', termin_id: 't1', reminder_typ: 'kunde_1h', empfaenger: 'kunde', geplant_fuer: new Date().toISOString(), status: 'pending', versuche: 0 },
      ] },
      ...kundeSubseq(), // Verarbeitung kunde_24h
      ...kundeSubseq(), // Verarbeitung kunde_1h
    ]
    await sendReminders(authedReq('send-reminders'))

    expect(h.sendCommunication).toHaveBeenCalledTimes(2)
    const trigger = h.sendCommunication.mock.calls.map(c => c[0])
    expect(trigger).toContain('reminder_24h') // aus kunde_24h
    expect(trigger).toContain('reminder_2h')  // aus kunde_1h
    // beide an die Kunden-Nummer, je genau einmal
    for (const call of h.sendCommunication.mock.calls) {
      expect((call[1] as { telefon: string }).telefon).toBe('+4917100000002')
    }
    expect(h.state.updateCalls.filter(u => u.status === 'sent')).toHaveLength(2)
  })

  it('termin-erinnerungen = KEIN Zweitsender: 0 Kunden-Reminder, Response ohne sent_24h/sent_2h', async () => {
    h.state.q = [
      { data: [{ id: 'te1', fall_id: 'f1', start_zeit: new Date(Date.now() + 48 * 3600 * 1000).toISOString() }] }, // 48h-Fenster
      { data: [] }, // pflichtdokumente: keine fehlend
      { error: null }, // update erinnerung_48h_docs_gesendet
    ]
    const res = await terminErinnerungen(authedReq('termin-erinnerungen'))
    const body = await res.json()

    expect(h.sendCommunication).not.toHaveBeenCalled() // kein Kunden-Reminder
    expect(body).not.toHaveProperty('sent_24h')        // 24h-Send-Pfad ist weg
    expect(body).not.toHaveProperty('sent_2h')         // 2h-Send-Pfad ist weg
    expect(body).toMatchObject({ ok: true, sent_48h_docs: 1 })
    expect(h.state.insertTables).not.toContain('nachrichten') // keine WA erzeugt
  })

  it('FAZIT: derselbe Termin -> reminder_24h genau 1x (Queue) + 0x (Scan) = kein Double-Send', async () => {
    // Queue-Seite (send-reminders): kunde_24h faellig
    h.state.q = [
      { data: [{ id: 'r24', termin_id: 't1', reminder_typ: 'kunde_24h', empfaenger: 'kunde', geplant_fuer: new Date().toISOString(), status: 'pending', versuche: 0 }] },
      ...kundeSubseq(),
    ]
    await sendReminders(authedReq('send-reminders'))
    const ausQueue = h.sendCommunication.mock.calls.filter(c => c[0] === 'reminder_24h').length

    // Scan-Seite (termin-erinnerungen): sendet keine zweite 24h
    h.sendCommunication.mockClear()
    h.state.q = [{ data: [] }]
    await terminErinnerungen(authedReq('termin-erinnerungen'))
    const ausScan = h.sendCommunication.mock.calls.filter(c => c[0] === 'reminder_24h').length

    expect(ausQueue).toBe(1) // Queue erinnert 24h
    expect(ausScan).toBe(0)  // Scan erinnert NICHT nochmal (vorher: 1 -> Double)
    expect(ausQueue + ausScan).toBe(1) // Summe 1 statt 2
  })
})
