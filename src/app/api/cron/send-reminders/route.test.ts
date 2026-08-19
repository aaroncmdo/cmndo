import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regression-Guard fuer #3277: Kunde-Telefon-Aufloesung bei claim-nativen Terminen.
// Bei lead_id=NULL am Termin muss die Nummer ueber claims.lead_id gefunden werden
// (effectiveLeadId = termin.lead_id ?? claims.lead_id) -> Reminder wird gesendet, nicht
// mit "Keine Telefonnummer" abgewiesen (das war der 72%-Fail-Bug).
const h = vi.hoisted(() => {
  const state = {
    q: [] as Array<{ data?: unknown; error?: unknown }>,
    updateCalls: [] as Array<Record<string, unknown>>,
  }
  const next = () => state.q.shift() ?? { data: null, error: null }
  const makeBuilder = () => {
    const b: Record<string, unknown> = {}
    // Nur LESE-Kettenglieder. Wer hier eines ergaenzt, muss pruefen, ob der
    // Produktionscode es wirklich nutzt — ein Mock, der mehr kann als noetig,
    // verdeckt spaeter echte Fehler. `or` kam mit der Bezug-Umstellung dazu
    // (route.ts -> bezugOrExpr) und fehlte hier, wodurch die Query mit
    // ".or is not a function" starb und dieser Regression-Guard nichts mehr schuetzte.
    for (const m of ['select', 'eq', 'lte', 'gte', 'lt', 'neq', 'in', 'or', 'order', 'limit']) b[m] = () => b
    b.single = () => Promise.resolve(next())
    b.maybeSingle = () => Promise.resolve(next())
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(next()).then(res)
    return b
  }
  const db = {
    from: () => ({
      select: () => makeBuilder(),
      update: (p: Record<string, unknown>) => { state.updateCalls.push(p); return makeBuilder() },
      insert: () => makeBuilder(),
    }),
  }
  const sendCommunication = vi.fn(async () => undefined)
  return { state, db, sendCommunication }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db }))
vi.mock('@/lib/communications/send', () => ({ sendCommunication: h.sendCommunication }))

import { GET } from './route'

const SECRET = 'test-cron-secret'
const req = () => new Request('http://localhost/api/cron/send-reminders', {
  headers: { authorization: `Bearer ${SECRET}` },
})
const lastUpdate = () => h.state.updateCalls.at(-1) as Record<string, unknown> | undefined

beforeEach(() => {
  process.env.CRON_SECRET = SECRET
  h.state.q = []
  h.state.updateCalls.length = 0
  vi.clearAllMocks()
})

describe('send-reminders — claim-native Kunde-Telefon (#3277)', () => {
  it('lead_id=NULL am Termin + claims.lead_id gesetzt -> Telefon aufgeloest -> sent', async () => {
    h.state.q = [
      { data: [{ id: 'rem1', termin_id: 'tm1', reminder_typ: 'kunde_morgen', empfaenger: 'kunde', geplant_fuer: '2026-07-01T06:00:00Z', status: 'pending', versuche: 0 }] }, // termin_reminders-Liste
      { data: { id: 'tm1', assignee_id: 'sv1', fall_id: 'f1', lead_id: null, claim_id: 'c1', start_zeit: '2026-07-01T10:00:00Z', end_zeit: '2026-07-01T11:00:00Z', status: 'bestaetigt' } }, // gutachter_termine
      { data: { lead_id: 'lead-1', schadenort_adresse: 'Strasse 1', schadenort_plz: '12345', schadenort_ort: 'Berlin' } }, // claims (claim-native Fallback-Quelle!)
      { data: { besichtigungsort_adresse: 'Werkstatt 5' } }, // aktueller Termin-Adresse
      { data: { id: 'sv1', profile_id: 'psv1', standort_lat: null, standort_lng: null } }, // sachverstaendige
      { data: { vorname: 'Sven', nachname: 'V', telefon: '+4915100000000' } }, // sv-profile
      { data: { vorname: 'Kim', nachname: 'K', telefon: '+4917100000000' } }, // leads (via claims.lead_id)
      { error: null }, // finale termin_reminders-update
    ]
    await GET(req())
    expect(h.sendCommunication).toHaveBeenCalledTimes(1)
    expect(lastUpdate()).toMatchObject({ status: 'sent' })
  })

  it('weder Termin- noch Claim-lead_id -> keine Nummer -> failed', async () => {
    h.state.q = [
      { data: [{ id: 'rem2', termin_id: 'tm2', reminder_typ: 'kunde_morgen', empfaenger: 'kunde', geplant_fuer: '2026-07-01T06:00:00Z', status: 'pending', versuche: 0 }] },
      { data: { id: 'tm2', assignee_id: 'sv1', fall_id: 'f2', lead_id: null, claim_id: 'c2', start_zeit: '2026-07-01T10:00:00Z', end_zeit: '2026-07-01T11:00:00Z', status: 'bestaetigt' } },
      { data: { lead_id: null, schadenort_adresse: 'Strasse 2', schadenort_plz: '12345', schadenort_ort: 'Berlin' } }, // claim ohne lead_id
      { data: { besichtigungsort_adresse: 'Werkstatt 6' } },
      { data: { id: 'sv1', profile_id: 'psv1', standort_lat: null, standort_lng: null } },
      { data: { vorname: 'Sven', nachname: 'V', telefon: '+4915100000000' } },
      { error: null }, // finale update (leads-Query uebersprungen, da effectiveLeadId null)
    ]
    await GET(req())
    expect(h.sendCommunication).not.toHaveBeenCalled()
    expect(lastUpdate()).toMatchObject({ status: 'failed', fehler: 'Keine Telefonnummer' })
  })

  it('falsches CRON_SECRET -> 401, kein Lauf', async () => {
    const res = await GET(new Request('http://localhost/api/cron/send-reminders', {
      headers: { authorization: 'Bearer wrong' },
    }))
    expect(res.status).toBe(401)
    expect(h.state.updateCalls).toHaveLength(0)
  })
})

describe('send-reminders — kunde_24h (Reminder-Konsolidierung)', () => {
  // kunde_24h ist der neue 24h-vorher-Reminder aus der Queue (loest den
  // doppelten termin-erinnerungen-Scan ab). Muss ueber den reminder_24h-Trigger
  // an die Kunde-Telefonnummer gehen und die Zeile auf sent setzen.
  it('kunde_24h -> reminder_24h-Trigger an Kunde-Telefon -> status=sent', async () => {
    h.state.q = [
      { data: [{ id: 'rem24', termin_id: 'tm24', reminder_typ: 'kunde_24h', empfaenger: 'kunde', geplant_fuer: '2026-07-01T09:00:00Z', status: 'pending', versuche: 0 }] }, // termin_reminders-Liste
      { data: { id: 'tm24', assignee_id: 'sv1', fall_id: 'f1', lead_id: 'lead-1', claim_id: 'c1', start_zeit: '2026-07-02T10:00:00Z', end_zeit: '2026-07-02T11:00:00Z', status: 'bestaetigt' } }, // gutachter_termine
      { data: { lead_id: 'lead-1', schadenort_adresse: 'Strasse 1', schadenort_plz: '12345', schadenort_ort: 'Berlin' } }, // claims
      { data: { besichtigungsort_adresse: 'Werkstatt 5' } }, // aktueller Termin-Adresse
      { data: { id: 'sv1', profile_id: 'psv1', standort_lat: null, standort_lng: null } }, // sachverstaendige
      { data: { vorname: 'Sven', nachname: 'V', telefon: '+4915100000000' } }, // sv-profile
      { data: { vorname: 'Kim', nachname: 'K', telefon: '+4917100000000' } }, // leads (Kunde)
      { error: null }, // finale termin_reminders-update
    ]
    await GET(req())
    expect(h.sendCommunication).toHaveBeenCalledTimes(1)
    expect(h.sendCommunication).toHaveBeenCalledWith('reminder_24h', expect.objectContaining({ telefon: '+4917100000000' }))
    expect(lastUpdate()).toMatchObject({ status: 'sent' })
  })
})
